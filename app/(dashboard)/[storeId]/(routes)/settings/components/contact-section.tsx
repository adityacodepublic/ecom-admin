"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StoreContact } from "@/lib/contact";

import { EditButton, SettingRow, SettingsModal, patchSettings, useOpen } from "./setting-row";

const ContactModal = ({ storeId, initial, onClose }: { storeId: string; initial: StoreContact; onClose: () => void }) => {
  const router = useRouter();
  const [phone, setPhone] = useState(initial.phone);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [email, setEmail] = useState(initial.email);
  const [address, setAddress] = useState(initial.address);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const wa = whatsapp.replace(/\D/g, "");
  const waError = wa && wa.length < 11 ? "Add the country code, for example 919876543210." : "";

  const onSave = async () => {
    if (waError) return;
    setError("");
    setLoading(true);
    const err = await patchSettings(`/api/${storeId}/contact`, { phone: phone.trim(), whatsapp: wa, email: email.trim(), address: address.trim() });
    setLoading(false);
    if (err) return setError(err);
    toast.success("Contact details saved.");
    router.refresh();
    onClose();
  };

  return (
    <SettingsModal title="Contact details" isOpen onClose={onClose} onSave={onSave} loading={loading} error={error} saveDisabled={!!waError}>
      <div className="grid gap-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" maxLength={100} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" disabled={loading} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="whatsapp">WhatsApp</Label>
        <Input id="whatsapp" maxLength={100} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="919876543210 (with country code)" disabled={loading} />
        {waError && <p className="text-sm text-destructive">{waError}</p>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" maxLength={100} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="shop@example.com" disabled={loading} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="address">Business address</Label>
        <Input id="address" maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shop 12, MG Road, Bengaluru, Karnataka 560001" disabled={loading} />
      </div>
    </SettingsModal>
  );
};

/** The store's contact details (shown to customers as Call / WhatsApp, plus business address for SEO). One row, edited in a modal. */
export const ContactSection = ({ storeId, initial }: { storeId: string; initial: StoreContact }) => {
  const { open, show, hide } = useOpen();
  const summary = [initial.phone, initial.whatsapp && `WhatsApp ${initial.whatsapp}`, initial.email, initial.address].filter(Boolean).join(" · ") || "Not set";
  return (
    <>
      <SettingRow title="Contact details" summary={summary} action={<EditButton onClick={show} label="Edit contact details" />} />
      {open && <ContactModal storeId={storeId} initial={initial} onClose={hide} />}
    </>
  );
};
