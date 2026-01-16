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

const formSchema = z.object({
  name: z.string().min(1).max(255),
  images: z.object({ url: z.string() }).array(),
  price: z.coerce.number().min(1),
  quantity: z.coerce.number().int().min(1),
  maxQuantity: z.coerce.number().int().min(1),
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
        price: parseFloat(String(initialData?.price)),
        filteritems: prefillFilterItems,
      }
    : {
        name: "",
        images: [],
        price: 0,
        quantity: 0,
        maxQuantity: 0,
        categoryId: "",
        filteritems: [],
        isFeatured: false,
        isArchived: false,
      };

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

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
      const submitData = {
        ...data,
        filteritems: data.filteritems || [],
      };
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/products/${params.productId}`,
          submitData
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
      toast.error("Something went wrong.");
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
                    value={field.value.map((image) => image.url)}
                    disabled={loading}
                    onChange={(url) =>
                      field.onChange([...field.value, { url }])
                    }
                    onRemove={(url) =>
                      field.onChange([
                        ...field.value.filter((current) => current.url !== url),
                      ])
                    }
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
                  <FormControl>
                    <Input
                      type="number"
                      disabled={loading}
                      placeholder="9.99"
                      {...field}
                    />
                  </FormControl>
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
                  <FormControl>
                    <Input
                      type="number"
                      disabled={loading}
                      placeholder="1 - 1000"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxQuantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Maximum Quantity</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      disabled={loading}
                      placeholder="Maximum Quantity a customer can buy"
                      {...field}
                    />
                  </FormControl>
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

          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};
