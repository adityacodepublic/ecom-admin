"use client"

import * as z from "zod"
import axios from "axios"
import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { toast } from "react-hot-toast"
import { X, Trash } from "lucide-react"
import { Filter, FilterGroup, filterGroupItem, Value } from "@prisma/client"
import { useParams, useRouter } from "next/navigation"
import { FancyBox } from "./multiselect"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import { Heading } from "@/components/ui/heading"
import { AlertModal } from "@/components/modals/alert-modal"
import { Decimal } from "@prisma/client/runtime/library"
import { Switch } from "@/components/ui/switch"

type Group = {
  id: string, name: string;
}

const formSchema = z.object({
  name: z.string().trim().min(2, 'Name too short'),
  value: z.object({value: z.coerce.number().optional(), unit: z.string().trim().min(1, 'Value should be more than one chracter.')}).array().optional(),
  feature: z.boolean().optional().default(false),
  group: z.object({id: z.string().trim().min(4), name: z.string().trim().min(1, 'Group name should be more than one chracter.')}).array().default([]),
}).superRefine((values, ctx)=>{ 
  if(values.feature === false && values.value?.length == 0){
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only features can have zero value. Filters need atleast one value",
      path: ['feature'],
    })
  };
});

type FilterFormValues = z.infer<typeof formSchema>

interface FilterFormProps {
  initialData: { name: string; value: { value: Decimal | null; unit: string; }[]; feature: boolean; id: string; filterGroupItems: { FilterGroup: { id:string; name: string; }; }[]; } | null
  filterGroup: {id:string, name:string}[];
};

export const FilterForm: React.FC<FilterFormProps> = ({
  initialData, filterGroup
}) => {
  const params = useParams();
  const router = useRouter();
  
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [colorValues, setColorValues] = useState<(string | null)[]>([]);
  const selectedGroup = initialData?.filterGroupItems.map((item)=>(item.FilterGroup)) || [];
  const [selectedValues, setSelectedValues] = useState<typeof selectedGroup>(selectedGroup?.length > 0 ? selectedGroup : []);
  
  const title = initialData ? 'Edit filter' : 'Create filter';
  const description = initialData ? 'Edit filter, feature.' : 'Add a new filter or feature.';
  const toastMessage = initialData ? 'Filter updated.' : 'Filter created.';
  const action = initialData ? 'Save changes' : 'Create';

  const transformInitialData = (data: typeof initialData): FilterFormValues => {
    return {
      name: data?.name || '',
      value: data?.value.map((v: any) => ({
        value: parseFloat(v.value.toString()), // Ensure value is a number
        unit: v.unit,
      })) || [{value:0, unit:'',}],
      feature: data?.feature || false,
      group: data?.filterGroupItems.map((group)=>(group.FilterGroup)) || []
    };
  };

  const transformedValue = (data: { unit: string; value?: number | undefined; }): string => {
    if (data) {
      if (data.value === undefined || null) {
        return data.unit;
      }
      else if (data.unit === "**") {
        return '';
      } 
      else {
        return data.value + data.unit;
      }
    } else {
      return '';
    }
  };
  
  function removeDuplicates(arr: Group[]): Group[] {
    const seen = new Set<string>();
    return arr.filter(obj => {
        const duplicate = seen.has(obj.id);
        seen.add(obj.id);
        return !duplicate;
      });
  };

  const defaultValues = initialData ? transformInitialData(initialData) : {
    name: '',
    value: [
      {
        unit:'',
      }
    ],
  };
  const form = useForm<FilterFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'value',
  });
  
  const handleInputChange = (index: number, input: string) => { 
    const numberMatch = input.match(/^(\d+)(.*)$/);
    if (numberMatch) {
        const number = parseInt(numberMatch[1], 10);
        const text = numberMatch[2].trim();
        form.setValue(`value.${index}.value`, number);
        form.setValue(`value.${index}.unit`, text);
    }
    else {
        form.setValue(`value.${index}.unit`, sanitize(input, index));
    }
  };

  const sanitize = (value: string, index:number): string => {
    const hexRegex = /#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/;
    const match = value.match(hexRegex);
    if (match) {
      const sanitizedValue = value.replace(new RegExp(`#?${match[1]}`, 'i'), '').replace(/[^A-Za-z0-9#\s]/g, '').replace(/\s+/g, ' ').trim();
      const hexColor = match[1].length === 3  ? match[1].split('').map(c => c + c).join('') : match[1];
      const newColors = [...colorValues];
      newColors[index] = hexColor ? `#${hexColor}` : null;
      setColorValues(newColors);
      return `#${hexColor}-${sanitizedValue}`;
    }
    return value.replace(/[^A-Za-z0-9#\s]/g, '').replace(/\s+/g, ' ').trim();
  };
  
  function isValidColor(strColor: string): boolean {
    if (typeof window !== "undefined" && typeof window.Option !== "undefined") {
      const s = new window.Option().style;
      s.color = strColor;
      return s.color !== '';
    }
    return false;
  };
  
  const onSubmit = async (data: FilterFormValues) => {
    try {
      setLoading(true);
      if(form.watch('feature') == true && data.value?.length === 0 ) form.setValue(`value.${0}.unit`, "**");
      if (initialData) {
        await axios.patch(`/api/${params.storeId}/filters/${params.filterId}`, data);
      } else {
        await axios.post(`/api/${params.storeId}/filters`, data);
      }
      router.refresh();
      router.push(`/${params.storeId}/filters`);
      toast.success(toastMessage);
    } catch (error: any) {
      console.log(error.response.data);
      toast.error('Something went wrong.');
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
      toast.success('Filter deleted.');
    } catch (error: any) {
      toast.error('Make sure you removed all products using this filter first.');
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };
    
  function removeValue(index:number) {
    if(form.watch('feature')) remove(index);
    else if(index>=1) remove(index); 
    else "";
  }

  useEffect(() => {
    const handleKeydown = (event: { key: string; ctrlKey: any; altKey: any; shiftKey: any }) => {
      if (event.key === '=' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        const unit = '';
        append({ unit });
      }
      if (event.key === '-' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        remove(fields.flatMap((item)=>(item.id)).length);
      }
    };
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [append,remove]);

  useEffect(() => {
    if (selectedValues) {
      form.setValue(`group`, removeDuplicates(selectedValues)); 
    }
  }, [selectedValues,form]);

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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full">
          <div className="md:grid md:grid-cols-3 gap-8 space-y-8 md:space-y-0">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input disabled={loading} placeholder="Filter name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="feature"
              render={({ field }) => (
                <FormItem className="items-start space-x-3 space-y-0 rounded-md border p-3">
                  <FormControl>
                    <div className="flex items-center space-x-3 pt-1 pl-3">
                      <FormLabel>Filter</FormLabel>
                      <Switch
                        disabled={loading}
                        checked={field.value}
                        // @ts-ignore
                        onCheckedChange={field.onChange}
                      />
                      <FormLabel>Feature</FormLabel>
                    </div>
                  </FormControl>
                  <div className=" pt-2.5 leading-none">
                    <FormDescription>
                      Do you want to use it as a filter.
                    </FormDescription>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormItem className="flex flex-row items-start space-x-4 space-y-0 rounded-md border p-4">
              <Button disabled={loading} className="py-6" type="button" size="lg" variant="secondary" onClick={() => append({ unit: '' })}>
                Add Value
              </Button>
              <div className="space-y-1 leading-none">
                <FormDescription>
                  Press  +  to add a field and - to remove field  .
                </FormDescription>
              </div>
            </FormItem>

            {fields.map((field, index) => (
              <div key={field.id+index}>  
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
                          {isValidColor(colorValues[index] || field.value.unit.substring(0,7) || '') && (
                            <div 
                              className=" p-4 rounded-full" 
                              style={{ backgroundColor: colorValues[index] || field.value.unit.substring(0,7) || 'transparent' }}
                            />
                          )}
                          <Input
                            placeholder="Enter value and unit"
                            disabled={loading}
                            defaultValue={transformedValue(field.value)||''}
                            onChange={(e) => handleInputChange(index, e.target.value)}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
            <Controller
              name="group"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <div className="space-y-1.5 leading-none p-4 rounded-md border">
                    <FormLabel>Select Filter Groups</FormLabel>
                    <FormDescription>In Product Details this filter data will be displayed under the Selected Groups </FormDescription>
                  </div>
                      <FancyBox data={filterGroup} loading={loading} setLoading={setLoading} limit={3} selectedValues={selectedValues} setSelectedValues={setSelectedValues} />
                  <FormMessage/>
                </FormItem>
              )}
            />
            </div>
          <Button disabled={loading} className="ml-auto" type="submit">
            {action}
          </Button>
        </form>
      </Form>
    </>
  );
};
