"use client";
import { useParams, useRouter } from "next/navigation";
import React, { useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useOrigin } from "@/hooks/use-origin";
import { tryCatch } from "@/lib/utils";

const formSchema = z.object({
  url: z.string().min(2),
  start: z.coerce.number().int().min(0),
  quant: z.coerce.number().int().max(100),
});

type SettingsFormValues = z.infer<typeof formSchema>;

const Loader = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  let i: number;
  const params = useParams();
  const origin = useOrigin();

  const baseUrl = `${origin}/api/${params.storeId}`;

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: SettingsFormValues) => {
    setLoading(true);

    try {
      let response: any = null;

      response = await tryCatch(Promise.resolve(JSON.parse(data.url)));
      if (response.error) response = await axios.get(data.url);

      for (i = data.start; i < data.start + data.quant; i++) {
        const data = response.data.record[i].data;

        await axios.post(`${baseUrl}/products`, data);
        router.refresh();
        router.push(`/${params.storeId}/products`);
        toast.success("Operation successful.");
      }
    } catch (error) {
      toast.error(`Something went wrong for ${i}`);
      console.log("error for >>>>>" + i, error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-8 w-full"
          >
            <div className="grid grid-cols-3 gap-8">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Json URL</FormLabel>
                    <FormControl>
                      <Input
                        disabled={loading}
                        placeholder="https://api.jsonbin.io/"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Data schema at{" "}
                      <a
                        href="https://raw.githubusercontent.com/adityacodepublic/ecom-admin/refs/heads/account-test/public/products-data-load.json"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-primary"
                      >
                        products-data-load.json
                      </a>
                      <br />
                      Add data via https://jsonbin.io/ or paste directly
                    </FormDescription>
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
                      <Input
                        disabled={loading}
                        placeholder="Starting position"
                        {...field}
                      />
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
                      <Input
                        disabled={loading}
                        placeholder="no. of records to upload"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button disabled={loading} className={`ml-auto`} type="submit">
              {loading ? "Loading" : "Save"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
};

export default Loader;
