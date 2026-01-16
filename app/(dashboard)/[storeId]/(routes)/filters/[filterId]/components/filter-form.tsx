"use client";

import * as z from "zod";
import axios from "axios";
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { X, Trash } from "lucide-react";
import { Filter, Value } from "@prisma/client";
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
import { Decimal } from "@prisma/client/runtime/library";

const formSchema = z.object({
  name: z.string().trim().min(2, "Name too short"),
  value: z
    .object({
      value: z.coerce.number().optional(),
      unit: z.string().trim().min(1, "Value should be more than one chracter."),
    })
    .array()
    .optional(),
});

type FilterFormValues = z.infer<typeof formSchema>;

interface FilterFormProps {
  initialData: {
    name: string;
    value: { value: Decimal | null; unit: string }[];
    id: string;
  } | null;
}

export const FilterForm: React.FC<FilterFormProps> = ({ initialData }) => {
  const params = useParams();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const title = initialData ? "Edit filter" : "Create filter";
  const description = initialData
    ? "Edit your filter details."
    : "Add a features of your products, to filter with.";
  const toastMessage = initialData ? "Filter updated." : "Filter created.";
  const action = initialData ? "Save changes" : "Create";

  const transformInitialData = (data: typeof initialData): FilterFormValues => {
    return {
      name: data?.name || "",
      value: data?.value.map((v: any) => ({
        value: v?.value ? Number(v.value) : undefined,
        unit: v.unit,
      })) || [{ value: 0, unit: "" }],
    };
  };

  const transformedValue = (data: {
    unit: string;
    value?: number | undefined;
  }): string => {
    if (data) {
      if (data.value === undefined || null) {
        return data.unit;
      } else if (data.unit === "**") {
        return "";
      } else {
        return data.value + data.unit;
      }
    } else {
      return "";
    }
  };

  const defaultValues = initialData
    ? transformInitialData(initialData)
    : {
        name: "",
        value: [
          {
            unit: "",
          },
        ],
      };
  const form = useForm<FilterFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "value",
  });

  const handleInputChange = (index: number, input: string) => {
    const numberMatch = input.match(/^(\d+)(.*)$/);
    if (numberMatch) {
      const number = parseInt(numberMatch[1], 10);
      const text = numberMatch[2].trim();
      form.setValue(`value.${index}.value`, number);
      form.setValue(`value.${index}.unit`, sanitize(text));
    } else {
      form.setValue(`value.${index}.unit`, sanitize(input));
    }
  };

  const sanitize = (value: string): string => {
    return value.replace(/\s+/g, " ").trim();
  };

  const onSubmit = async (data: FilterFormValues) => {
    try {
      setLoading(true);
      if (initialData) {
        await axios.patch(
          `/api/${params.storeId}/filters/${params.filterId}`,
          data
        );
      } else {
        await axios.post(`/api/${params.storeId}/filters`, data);
      }
      router.refresh();
      router.push(`/${params.storeId}/filters`);
      toast.success(toastMessage);
    } catch (error: any) {
      console.log(error.response.data);
      toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async () => {
    try {
      setLoading(true);
      await axios.delete(`/api/${params.storeId}/filters/${params.filterId}`);
      router.refresh();
      router.push(`/${params.storeId}/filters`);
      toast.success("Filter deleted.");
    } catch (error: any) {
      toast.error(
        "Make sure you removed all products using this filter first."
      );
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  function removeValue(index: number) {
    if (index >= 1) remove(index);
  }

  useEffect(() => {
    const handleKeydown = (event: {
      key: string;
      ctrlKey: any;
      altKey: any;
      shiftKey: any;
    }) => {
      if (
        event.key === "=" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        const unit = "";
        append({ unit });
      }
      if (
        event.key === "-" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        remove(fields.flatMap((item) => item.id).length);
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [append, remove, fields]);

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
          <div className="md:grid md:grid-cols-2 gap-8 space-y-8 md:space-y-0">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Filter name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem>
              <Button
                disabled={loading}
                className="py-6 mt-6"
                type="button"
                size="lg"
                variant="secondary"
                onClick={() => append({ unit: "" })}
              >
                Add Value
              </Button>
            </FormItem>

            {fields.map((field, index) => (
              <div key={field.id + index}>
                <FormField
                  control={form.control}
                  name={`value.${index}`}
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex flex-row items-center">
                        <Button
                          disabled={loading}
                          variant="outline"
                          className="h-5 mr-4 rounded-md px-1 py-3"
                          type="button"
                          onClick={() => removeValue(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <FormLabel>Value {index + 1}</FormLabel>
                      </div>
                      <FormControl>
                        <div className="flex items-center gap-x-2">
                          <Input
                            placeholder="Enter value and unit"
                            disabled={loading}
                            defaultValue={transformedValue(field.value) || ""}
                            onChange={(e) =>
                              handleInputChange(index, e.target.value)
                            }
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
          </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};
