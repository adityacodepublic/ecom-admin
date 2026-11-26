import { Prisma } from "@prisma/client";
import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { OrderError } from "./errors";
import { COUNTRY, INDIAN_STATES } from "./india";

/**
 * The customer's own profile and saved addresses (customers are global, not per store).
 * Called only by the customer routes, after the store's server proved who the customer is.
 * Edits are explicit: checkout never changes an existing profile or address.
 */

const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 -]{8,18}[0-9]$/, "Enter a valid phone number");

export const profileCreateSchema = z
  .object({
    fname: z.string().trim().min(1, "Name is required").max(100),
    email: z.string().trim().email().max(200),
    phone,
    imgurl: z.string().trim().max(500).optional(),
  })
  .strict();

export const profilePatchSchema = profileCreateSchema.partial().strict();

export const addressInputSchema = z
  .object({
    street: z.string().trim().min(3, "Enter the house, street and area").max(300),
    city: z.string().trim().min(2, "Enter the city or town").max(100),
    state: z.enum(INDIAN_STATES, { errorMap: () => ({ message: "Choose the state" }) }),
    pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a 6 digit pincode"),
    instructions: z.string().trim().max(255).optional(),
  })
  .strict();

export const addressPatchSchema = addressInputSchema.partial().strict();

export type CustomerProfile = { id: string; fname: string; email: string; phone: string; imgurl: string };
export type CustomerAddress = { id: string; street: string; city: string; state: string; country: string; pincode: string; instructions: string };

const toProfile = (u: { id: string; fname: string; email: string; phone: string; imgurl: string | null }): CustomerProfile => ({
  id: u.id,
  fname: u.fname,
  email: u.email,
  phone: u.phone,
  imgurl: u.imgurl ?? "",
});

const toAddress = (a: { id: string; street: string; city: string; state: string; country: string; pincode: number; instructions: string | null }): CustomerAddress => ({
  id: a.id,
  street: a.street,
  city: a.city,
  state: a.state,
  country: a.country,
  pincode: String(a.pincode),
  instructions: a.instructions ?? "",
});

/** A profile row with no name or phone yet (made when a first address is saved): checkout still asks for the contact. */
export const isProfileComplete = (u: { fname: string; phone: string } | null | undefined): boolean => !!u && u.fname.trim() !== "" && u.phone.trim() !== "";

/** Most saved addresses one shopper can keep. */
export const MAX_ADDRESSES = 20;

/** Profile + saved addresses. profile is null before the first order / first PATCH. Light on purpose (checkout loads it). */
export async function getCustomer(customerId: string) {
  const user = await prismadb.users.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      fname: true,
      email: true,
      phone: true,
      imgurl: true,
      address: { select: { id: true, street: true, city: true, state: true, country: true, pincode: true, instructions: true }, orderBy: { id: "asc" } },
    },
  });
  if (!user) return { profile: null, addresses: [] as CustomerAddress[] };
  return { profile: isProfileComplete(user) ? toProfile(user) : null, addresses: user.address.map(toAddress) };
}

/**
 * Writes the first full profile: creates the row, or fills a bare one (no name or phone yet). A complete profile is never overwritten.
 * Two at once: createMany + skipDuplicates makes one win quietly (an upsert would fail with a unique-key error).
 */
export async function fillProfile(customerId: string, data: z.infer<typeof profileCreateSchema>) {
  const contact = { fname: data.fname, email: data.email, phone: data.phone, imgurl: data.imgurl ?? "" };
  await prismadb.users.createMany({ data: [{ id: customerId, ...contact }], skipDuplicates: true });
  await prismadb.users.updateMany({ where: { id: customerId, OR: [{ fname: "" }, { phone: "" }] }, data: contact });
  return prismadb.users.findUniqueOrThrow({ where: { id: customerId } });
}

/** Creates the profile (all of fname, email, phone needed) or updates the given fields. */
export async function upsertProfile(customerId: string, patch: z.infer<typeof profilePatchSchema>): Promise<CustomerProfile> {
  const existing = await prismadb.users.findUnique({ where: { id: customerId } });
  if (existing && isProfileComplete(existing)) {
    return toProfile(await prismadb.users.update({ where: { id: customerId }, data: patch }));
  }
  // New, or a bare row made by a first saved address: all of name, email and phone are needed.
  const full = profileCreateSchema.safeParse({ ...(existing ? { fname: existing.fname, email: existing.email, phone: existing.phone, imgurl: existing.imgurl ?? "" } : {}), ...patch });
  if (!full.success) throw new OrderError("PROFILE_REQUIRED", "Name, email and phone are needed", full.error.flatten());
  return toProfile(await fillProfile(customerId, full.data));
}

export async function addAddress(customerId: string, input: z.infer<typeof addressInputSchema>): Promise<CustomerAddress> {
  // A shopper can save an address before the first order: a bare profile row (checkout still asks for name and phone) is made.
  await prismadb.users.createMany({ data: [{ id: customerId }], skipDuplicates: true });
  if ((await prismadb.address.count({ where: { usersId: customerId } })) >= MAX_ADDRESSES) {
    throw new OrderError("ADDRESS_LIMIT", `You can save up to ${MAX_ADDRESSES} addresses. Remove one to add another.`);
  }
  const a = await prismadb.address.create({
    data: { usersId: customerId, street: input.street, city: input.city, state: input.state, country: COUNTRY, pincode: Number(input.pincode), instructions: input.instructions ?? "" },
  });
  return toAddress(a);
}

/** Edits one of the customer's own addresses. Old orders keep their frozen copy (details.shipTo). */
export async function updateAddress(customerId: string, addressId: string, patch: z.infer<typeof addressPatchSchema>): Promise<CustomerAddress> {
  const data: Prisma.AddressUpdateManyMutationInput = {};
  if (patch.street !== undefined) data.street = patch.street;
  if (patch.city !== undefined) data.city = patch.city;
  if (patch.state !== undefined) data.state = patch.state;
  if (patch.pincode !== undefined) data.pincode = Number(patch.pincode);
  if (patch.instructions !== undefined) data.instructions = patch.instructions;
  const { count } = await prismadb.address.updateMany({ where: { id: addressId, usersId: customerId }, data });
  if (count !== 1) throw new OrderError("ADDRESS_NOT_FOUND", "Address not found");
  return toAddress(await prismadb.address.findUniqueOrThrow({ where: { id: addressId } }));
}

/**
 * Removes a saved address. One no order used is deleted. One an order used is detached (usersId = null): it leaves the
 * shopper's list and can never be picked again, while the order keeps its row and its own frozen copy (details.shipTo).
 */
export async function deleteAddress(customerId: string, addressId: string) {
  const { count } = await prismadb.address.updateMany({ where: { id: addressId, usersId: customerId }, data: { usersId: null } });
  if (count !== 1) throw new OrderError("ADDRESS_NOT_FOUND", "Address not found");
  await prismadb.address.deleteMany({ where: { id: addressId, usersId: null, orders: { none: {} } } });
}
