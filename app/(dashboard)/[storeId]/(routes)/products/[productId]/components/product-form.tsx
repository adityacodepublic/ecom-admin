"use client";

import * as z from "zod";
import axios from "axios";
import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import { toast } from "react-hot-toast";
import { Trash, X } from "lucide-react";
import { Category, Image, Product } from "@prisma/client";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Heading } from "@/components/ui/heading";
import { AlertModal } from "@/components/modals/alert-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ImageUpload from "@/components/ui/image-upload";
import { Checkbox } from "@/components/ui/checkbox";

// The editor needs the browser, so it is not rendered on the server.
const MarkdownEditor = dynamic(() => import("@/components/ui/markdown-editor"), {
  ssr: false,
  loading: () => <div className="h-40 rounded-md border" />,
});

const optionalPositiveInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number({ invalid_type_error: "Enter a whole number, 1 or more" }).int("Enter a whole number, 1 or more").min(1, "Enter a whole number, 1 or more").optional(),
);

const optionalNonNegativeInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().optional(),
);

const formSchema = z.object({
  name: z.string().min(1).max(255),
  images: z.object({ url: z.string(), order: z.number() }).array(),
  price: z.coerce.number().optional(),
  // "Price on request": no price; customers ask for a quote and the price is set on their order.
  priceOnRequest: z.boolean().default(false),
  quantity: optionalNonNegativeInt,
  // "Don't track stock": quantity is saved as null (always available, never deducted on orders).
  untrackedStock: z.boolean().default(false),
  maxQuantity: optionalPositiveInt,
  categoryId: z.string().min(1),
  filteritems: z
    .array(
      z.object({
        filterId: z.string().min(1),
        valueId: z.string().min(1),
      })
    )
    .optional(),
  isFeatured: z.boolean().default(false).optional(),
  isArchived: z.boolean().default(false).optional(),
  description: z.string().optional(),
}).superRefine((v, ctx) => {
  if (!v.priceOnRequest && !(typeof v.price === "number" && v.price >= 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Enter a price of at least ₹1, or turn on Price on request" });
  }
  if (!v.untrackedStock && !(typeof v.quantity === "number" && Number.isInteger(v.quantity) && v.quantity >= 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["quantity"], message: "Enter a whole number (0 or more), or turn on Don't track stock" });
  }
});

type ProductFormValues = z.infer<typeof formSchema>;

interface Filter {
  id: string;
  name: string;
  values: { id: string; value: string | null; unit: string }[];
}

interface ProductFormProps {
  initialData:
    | (Product & {
        images: Image[];
        filteritems?: Array<{
          valueId: string;
          value: {
            value: string | null;
            unit: string;
            filterId: string;
            filter: {
              id: string;
              name: string;
            };
          };
        }>;
      })
    | null;
  categories: Category[];
  filters: Array<{
    id: string;
    name: string;
    value: Array<{
      id: string;
      value: string | null;
      unit: string;
    }>;
  }>;
}

export const ProductForm: React.FC<ProductFormProps> = ({
  initialData,
  categories,
  filters: serverFilters,
}) => {
  const params = useParams();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);

  const title = initialData ? "Edit product" : "Create product";
  const description = initialData ? "Edit a product." : "Add a new product";
  const toastMessage = initialData ? "Product updated." : "Product created.";
  const action = initialData ? "Save changes" : "Create";

  // Convert server filters to client format
  const convertedFilters: Filter[] = serverFilters.map((filter) => ({
    id: filter.id,
    name: filter.name,
    values: filter.value || [],
  }));

  // Build prefilled filteritems from initialData
  const prefillFilterItems = initialData?.filteritems
    ? initialData.filteritems.map((item) => ({
        filterId: item.value.filterId,
        valueId: item.valueId,
      }))
    : [];

  const defaultValues = initialData
    ? {
        ...initialData,
        description: initialData.description ?? "",
        price: initialData.price === null ? undefined : parseFloat(String(initialData.price)),
        priceOnRequest: initialData.price === null,
        quantity: initialData.quantity === null ? undefined : initialData.quantity,
        untrackedStock: initialData.quantity === null,
        maxQuantity: initialData.maxQuantity === null ? undefined : initialData.maxQuantity,
        filteritems: prefillFilterItems,
        images: initialData.images
          .sort((a, b) => a.order - b.order)
          .map((img) => ({
            url: img.url,
            order: img.order,
          })),
      }
    : {
        name: "",
        images: [],
        price: 0,
        priceOnRequest: false,
        quantity: 0,
        untrackedStock: false,
        maxQuantity: undefined,
        categoryId: "",
        filteritems: [],
        isFeatured: false,
        isArchived: false,
        description: "",
      };

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const onRequest = form.watch("priceOnRequest");
  const untrackedStock = form.watch("untrackedStock");

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "filteritems",
  });

  // Initialize with server filters on mount
  useEffect(() => {
    setFilters(convertedFilters);
  }, [serverFilters]);

  const onSubmit = async (data: ProductFormValues) => {
    try {
      setLoading(true);
      const { priceOnRequest, untrackedStock: skipStock, ...rest } = data;
      const submitData = {
        ...rest,
        price: priceOnRequest ? null : data.price, // null = "Price on request"
        quantity: skipStock ? null : data.quantity, // null = stock not tracked
        maxQuantity: data.maxQuantity ?? null, // null = no per-order limit
        filteritems: data.filteritems || [],
      };
      if (initialData) {
        // loadedQuantity = the stock this page loaded. The API writes stock only if it was edited, so saving
        // other fields cannot overwrite sales made since the page opened.
        await axios.patch(
          `/api/${params.storeId}/products/${params.productId}`,
          { ...submitData, loadedQuantity: initialData.quantity }
        );
      } else {
        await axios.post(`/api/${params.storeId}/products`, submitData);
      }
      router.refresh();
      router.push(`/${params.storeId}/products`);
      toast.success(toastMessage);
    } catch (error: any) {
      toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${params.storeId}/products/${params.productId}`);
      router.refresh();
      router.push(`/${params.storeId}/products`);
      toast.success("Product deleted.");
    } catch (error: any) {
      // 409 carries a plain-text reason ("in an order, archive it instead").
      const d = axios.isAxiosError(error) && error.response?.status === 409 ? error.response.data : null;
      toast.error(typeof d === "string" && d ? d : "Something went wrong.");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  // Get selected filter IDs to prevent duplicates
  const selectedFilterIds = form
    .watch("filteritems")
    ?.map((field) => field.filterId);

  const notSelectedFilters = filters.filter(
    (f) => !selectedFilterIds?.includes(f.id)
  );
  const availableFilters = filters.filter(
    (f) => !selectedFilterIds?.includes(f.id)
  );

  return (
    <>
      <AlertModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onDelete}
        loading={loading}
      />
      <div className="flex items-center justify-between">
        <Heading title={title} description={description} />
        {initialData && (
          <Button
            disabled={loading}
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            <Trash className="h-4 w-4" />
          </Button>
        )}
      </div>
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8 w-full"
        >
          <FormField
            control={form.control}
            name="images"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Images</FormLabel>
                <FormControl>
                  <ImageUpload
                    value={field.value}
                    disabled={loading}
                    onChange={(images) => field.onChange(images)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="md:grid md:grid-cols-3 md:gap-8 space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Product name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price</FormLabel>
                  {onRequest ? (
                    <p className="flex h-9 items-center text-sm text-muted-foreground">No price: customers ask for a quote.</p>
                  ) : (
                    <FormControl>
                      <Input type="number" disabled={loading} placeholder="9.99" {...field} value={field.value ?? ""} />
                    </FormControl>
                  )}
                  <FormField
                    control={form.control}
                    name="priceOnRequest"
                    render={({ field: toggle }) => (
                      // The label sits next to the checkbox (not around it): a button inside a label toggles twice.
                      <div className="flex w-fit items-center gap-2 text-sm">
                        <Checkbox
                          id="price-on-request"
                          disabled={loading}
                          checked={toggle.value}
                          onCheckedChange={(v) => {
                            toggle.onChange(v === true);
                            form.clearErrors("price");
                          }}
                        />
                        <label htmlFor="price-on-request" className="cursor-pointer">
                          Price on request
                        </label>
                      </div>
                    )}
                  />
                  <FormDescription>
                    {onRequest
                      ? "The store shows your \"price on request\" text. You add the price on each order and send it as a quote."
                      : "Turn on Price on request when the price depends on the order (custom work, bulk)."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  {untrackedStock ? (
                    <p className="flex h-9 items-center text-sm text-muted-foreground">Stock is not tracked. Always available to order.</p>
                  ) : (
                    <FormControl>
                      <Input
                        type="number"
                        disabled={loading}
                        placeholder="0 - 1000"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                  )}
                  <FormField
                    control={form.control}
                    name="untrackedStock"
                    render={({ field: toggle }) => (
                      <div className="flex w-fit items-center gap-2 text-sm">
                        <Checkbox
                          id="untracked-stock"
                          disabled={loading}
                          checked={toggle.value}
                          onCheckedChange={(v) => {
                            toggle.onChange(v === true);
                            form.clearErrors("quantity");
                          }}
                        />
                        <label htmlFor="untracked-stock" className="cursor-pointer">
                          Don&apos;t track stock
                        </label>
                      </div>
                    )}
                  />
                  <FormDescription>
                    {untrackedStock
                      ? "Stock never runs out and is not deducted on orders."
                      : "Turn on Don't track stock for made-to-order or bulk items."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxQuantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maximum Quantity (optional)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      disabled={loading}
                      placeholder="No limit"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormDescription>Leave blank for no per-order limit.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    disabled={loading}
                    onValueChange={field.onChange}
                    value={field.value}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          defaultValue={field.value}
                          placeholder="Select a category"
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.length > 0 ? (
                        categories
                          .slice()
                          .sort((a, b) =>
                            a.name.localeCompare(b.name, undefined, {
                              sensitivity: "base",
                            })
                          )
                          .map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))
                      ) : (
                        <SelectItem value="" disabled>
                          No categories available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isFeatured"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      disabled={loading}
                      checked={field.value}
                      // @ts-ignore
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Featured</FormLabel>
                    <FormDescription>
                      This product will appear on the home page
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isArchived"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      // @ts-ignore
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Archived</FormLabel>
                    <FormDescription>
                      This product will not appear anywhere in the store.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>

          {/* Filter Selection Section */}
          <Separator className="h-[0.5px]" />
          <div className="md:grid md:grid-cols-3 gap-8">
            <div className="mb-4">
              <FormLabel className="text-base">Filters</FormLabel>
              <FormDescription>
                Add filter values to this product
              </FormDescription>
            </div>

            <div className="space-y-4 col-span-2">
              {fields.length > 0 && (
                <>
                  {fields.map((field, index) => {
                    const selectedFilter = filters.find(
                      (f) =>
                        f.id === form.watch(`filteritems.${index}.filterId`)
                    );
                    const filterValues = selectedFilter?.values || [];

                    return (
                      <div key={field.id} className="flex gap-3 items-end">
                        {/* Filter Name Dropdown */}
                        <FormField
                          control={form.control}
                          name={`filteritems.${index}.filterId`}
                          render={({ field: filterField }) => (
                            <FormItem className="flex-1">
                              <FormLabel>Filter</FormLabel>
                              <Select
                                disabled={loading}
                                onValueChange={(value) => {
                                  filterField.onChange(value);
                                  // Reset valueId when filter changes
                                  form.setValue(
                                    `filteritems.${index}.valueId`,
                                    ""
                                  );
                                }}
                                value={filterField.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a filter">
                                      {selectedFilter?.name}
                                    </SelectValue>
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {notSelectedFilters.length > 0 ? (
                                    notSelectedFilters
                                      .slice()
                                      .sort((a, b) =>
                                        a.name.localeCompare(
                                          b.name,
                                          undefined,
                                          { sensitivity: "base" }
                                        )
                                      )
                                      .map((filter) => (
                                        <SelectItem
                                          key={filter.id}
                                          value={filter.id}
                                        >
                                          {filter.name}
                                        </SelectItem>
                                      ))
                                  ) : (
                                    <SelectItem value="" disabled>
                                      No filters available
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Filter Value Dropdown */}
                        <FormField
                          control={form.control}
                          name={`filteritems.${index}.valueId`}
                          render={({ field: valueField }) => (
                            <FormItem className="flex-1">
                              <FormLabel>Value</FormLabel>
                              <Select
                                disabled={loading || !selectedFilter}
                                onValueChange={valueField.onChange}
                                value={valueField.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a value" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {filterValues.length > 0 ? (
                                    filterValues
                                      .slice()
                                      .sort((a, b) => {
                                        const aHasValue = a.value !== null;
                                        const bHasValue = b.value !== null;

                                        // 1. Both have values → numeric sort
                                        if (aHasValue && bHasValue) {
                                          return (
                                            parseFloat(a.value!) -
                                            parseFloat(b.value!)
                                          );
                                        }
                                        // 2. Only one has value → value comes first
                                        if (aHasValue) return -1;
                                        if (bHasValue) return 1;

                                        // 3. Neither has value → sort by unit
                                        return (a.unit ?? "").localeCompare(
                                          b.unit ?? "",
                                          undefined,
                                          {
                                            sensitivity: "base",
                                          }
                                        );
                                      })
                                      .map((value) => (
                                        <SelectItem
                                          key={value.id}
                                          value={value.id}
                                        >
                                          {value.value
                                            ? `${value.value}${
                                                value.unit
                                                  ? ` ${value.unit}`
                                                  : ""
                                              }`
                                            : value.unit}
                                        </SelectItem>
                                      ))
                                  ) : selectedFilter ? (
                                    <SelectItem value="" disabled>
                                      No values found for this filter
                                    </SelectItem>
                                  ) : (
                                    <SelectItem value="" disabled>
                                      Select a filter first
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Remove Button */}
                        <Button
                          type="button"
                          variant="link"
                          // size=""
                          onClick={() => remove(index)}
                          disabled={loading}
                        >
                          <X className="h- w-5" />
                        </Button>
                      </div>
                    );
                  })}
                </>
              )}
              <div />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-7"
                disabled={loading || availableFilters.length === 0}
                onClick={() => append({ filterId: "", valueId: "" })}
              >
                Add Filter
              </Button>
            </div>
          </div>

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Markdown)</FormLabel>
                <FormControl>
                  <MarkdownEditor
                    value={field.value ?? ""}
                    disabled={loading}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormDescription>
                  Shown on the store product page. Images can be uploaded or added from a link.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};
