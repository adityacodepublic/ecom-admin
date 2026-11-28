"use client"

import axios from "axios"
import { toast } from "react-hot-toast"
import { Store } from "@prisma/client"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Heading } from "@/components/ui/heading"
import { storeUrl } from "@/lib/store-url"
import { ChangeSlugModal } from "./change-slug-modal"
import { StoreUrlCard } from "./store-url-card"
import { EditButton, SettingRow, SettingsList, SettingsModal, useOpen } from "./setting-row"

interface SettingsFormProps {
  initialData: Pick<Store, "id" | "name" | "slug">;
  /** More rows for the first list (for example the contact details). */
  children?: React.ReactNode;
};

export const SettingsForm: React.FC<SettingsFormProps> = ({
  initialData,
  children,
}) => {
  const params = useParams();
  const router = useRouter();

  const [slugOpen, setSlugOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const nameModal = useOpen();
  const [name, setName] = useState(initialData.name);
  const [nameError, setNameError] = useState("");

  const onSaveName = async () => {
    const next = name.trim();
    if (next.length < 2) return setNameError("Use at least 2 characters.");
    try {
      setLoading(true);
      await axios.patch(`/api/${params.storeId}/branding`, { name: next });
      router.refresh();
      toast.success('Store updated.');
      nameModal.hide();
    } catch (error: any) {
      setNameError('Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <ChangeSlugModal
      storeId={initialData.id}
      currentSlug={initialData.slug}
      isOpen={slugOpen}
      onClose={() => setSlugOpen(false)}
    />
      <div className="flex items-center justify-between">
        <Heading title="Store settings" />
      </div>
      <Separator />
      <SettingsList>
        <SettingRow
          title="Store name"
          summary={initialData.name}
          action={<EditButton onClick={() => { setName(initialData.name); setNameError(""); nameModal.show(); }} label="Edit store name" />}
        />
        {children}
        <StoreUrlCard url={storeUrl(initialData.slug)} onChange={() => setSlugOpen(true)} />
      </SettingsList>
      <SettingsModal title="Store name" isOpen={nameModal.open} onClose={nameModal.hide} onSave={onSaveName} loading={loading} error={nameError}>
        <div className="grid gap-1.5">
          <Label htmlFor="store-name">Name</Label>
          <Input id="store-name" disabled={loading} placeholder="Store name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </SettingsModal>
    </>
  );
};
