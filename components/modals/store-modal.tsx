"use client";

import * as z from "zod"
import axios from "axios";
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { useState } from "react";

import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useStoreModal } from "@/hooks/use-store-modal";
import { Button } from "@/components/ui/button";
import { SlugInput } from "@/components/slug-input";
import { slugErrorFromResponse, useSlugAvailability } from "@/hooks/use-slug-availability";
import { slugError, slugify } from "@/lib/slug";

const formSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().superRefine((value, ctx) => {
    const error = slugError(value);
    if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
  }),
});

export const StoreModal = () => {
  const storeModal = useStoreModal();

  const [loading, setLoading] = useState(false);
  // Until the owner types a URL name, it follows the store name as a suggestion.
  const [slugEdited, setSlugEdited] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slug: "",
    },
  });
  const hint = useSlugAvailability(form.watch("slug"));

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setLoading(true);
      const response = await axios.post('/api/stores', values);
      window.location.assign(`/${response.data.id}`);
    } catch (error) {
      const slugMessage = slugErrorFromResponse(error);
      if (slugMessage) form.setError("slug", { message: slugMessage });
      else toast.error('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Create store"
      description="Add a new store to manage products and categories."
      isOpen={storeModal.isOpen}
      onClose={storeModal.onClose}
    >
      <div>
        <div className="space-y-4 py-2 pb-4">
          <div className="space-y-2">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="E-Commerce"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            if (!slugEdited) form.setValue("slug", slugify(e.target.value));
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Store URL name</FormLabel>
                      <FormControl>
                        <SlugInput
                          disabled={loading}
                          placeholder="my-store"
                          value={field.value}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          hint={form.formState.errors.slug ? { state: "idle" } : hint}
                          onChange={(value) => {
                            setSlugEdited(true);
                            form.clearErrors("slug");
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                      <FormDescription>Your store&apos;s web address. You can change it later in Settings.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="pt-2 space-x-2 flex items-center justify-end w-full">
                  <Button disabled={loading} variant="outline" type="button" onClick={storeModal.onClose}>
                    Cancel
                  </Button>
                  <Button disabled={loading} type="submit">Continue</Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </Modal>
  );
};
