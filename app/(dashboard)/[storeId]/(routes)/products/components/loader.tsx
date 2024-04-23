"use client";
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import axios from 'axios';
import { toast } from "react-hot-toast"
import { Input } from '@/components/ui/input';
import { Button } from "@/components/ui/button"
import { Separator } from '@/components/ui/separator';
import { useForm } from "react-hook-form"
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"


const formSchema = z.object({
  url: z.string().min(2),
  start: z.coerce.number().int().min(0),
  quant: z.coerce.number().int().max(100),
});

type SettingsFormValues = z.infer<typeof formSchema>


const Loader = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  let i:number;

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(formSchema)
  });
  


  const onSubmit = async (data: SettingsFormValues) =>  {
    setLoading(true);
    
    try {
      const response = await axios.get(data.url);

      for (i = data.start; i < data.start + data.quant; i++) {
        const data = response.data.record[i];
        // console.log(data);
        await axios.post(`/api/757945cd-8675-46c4-b999-d7a7bcbec812/products`, data);
        router.refresh();
        router.push(`/757945cd-8675-46c4-b999-d7a7bcbec812/products`);
        toast.success('Operation successful.');
      }

    } catch (error) {
      toast.error(`Something went wrong for ${i}`);
      console.log("error for >>>>>" + i );
    } finally {
      setLoading(false);
    }
  };
  

  return (
    <div>
        <div className='mb-7'>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full">
              <div className="grid grid-cols-3 gap-8">
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Json URL</FormLabel>
                      <FormControl>
                        <Input disabled={loading} placeholder="https://api.jsonbin.io/" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="start"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start</FormLabel>
                      <FormControl>
                        <Input disabled={loading} placeholder="Starting position" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />            
                <FormField
                control={form.control}
                name="quant"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount of records</FormLabel>
                    <FormControl>
                      <Input disabled={loading} placeholder="no. of records to upload" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>
              <Button disabled={loading} className={`ml-auto ${loading? 'text-slate-800':'text-black'}`} type="submit">
                {loading ? "Loading":"Save"}
              </Button>
            </form>
          </Form>
        </div>
    </div>
  );
};

export default Loader;
