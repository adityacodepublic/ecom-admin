"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "react-hot-toast";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Switch } from "@/components/ui/switch";
import { TagInput } from "@/components/ui/tag-input";
import { QUOTE_BUTTON_PRESETS, QUOTE_LABEL_MAX, QUOTE_PRICE_PRESETS, type OrderSettings } from "@/lib/orders/settings";
import { cn } from "@/lib/utils";
import { REJECTED, cleanStatusList } from "@/lib/orders/status";

import { PushSetting } from "@/components/push/push-setting";

import { EditButton, SettingRow, SettingsList, SettingsModal, patchSettings, useOpen } from "./setting-row";

const toText = (list: string[]) => list.join(", ");
const fromText = (text: string) => text.split(",");

type ModalProps = { storeId: string; initial: OrderSettings; onClose: () => void };

/** Shared save: PATCH the order settings, refresh, close. */
function useSave(storeId: string, onClose: () => void) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const save = async (body: unknown) => {
    setError("");
    setLoading(true);
    const err = await patchSettings(`/api/${storeId}/order-settings`, body);
    setLoading(false);
    if (err) return setError(err);
    toast.success("Saved.");
    router.refresh();
    onClose();
  };
  return { save, loading, error };
}

// ---------------------------------------------------------------- order statuses

const StatusesModal = ({ storeId, initial, onClose }: ModalProps) => {
  const { save, loading, error } = useSave(storeId, onClose);
  const [text, setText] = useState(toText(initial.statuses));
  const parsed = cleanStatusList(fromText(text));
  return (
    <SettingsModal title="Order statuses" isOpen onClose={onClose} onSave={() => parsed.ok && save({ statuses: parsed.list })} loading={loading} error={error} saveDisabled={!parsed.ok}>
      <div className="grid gap-1.5">
        <Label htmlFor="statuses">Statuses, in order</Label>
        <Input id="statuses" value={text} onChange={(e) => setText(e.target.value)} disabled={loading} />
        <p className="text-xs text-muted-foreground">Separate with commas. The first is for new orders, the last is the final stage.</p>
        {!parsed.ok && <p className="text-sm text-destructive">{parsed.error}</p>}
      </div>
    </SettingsModal>
  );
};

// ---------------------------------------------------------------- cancellation

const CancellationModal = ({ storeId, initial, onClose }: ModalProps) => {
  const { save, loading, error } = useSave(storeId, onClose);
  const c = initial.cancellation;
  const [enabled, setEnabled] = useState(c.enabled);
  const [allowedAt, setAllowedAt] = useState(c.allowedAt);
  const [askReason, setAskReason] = useState(c.askReason);
  const [reasons, setReasons] = useState(c.reasons);
  return (
    <SettingsModal
      title="Cancellation"
      isOpen
      onClose={onClose}
      onSave={() => save({ cancellation: { enabled, allowedAt, askReason, reasons } })}
      loading={loading}
      error={error}
    >
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="cancelOn">Let customers cancel</Label>
        <Switch id="cancelOn" checked={enabled} onCheckedChange={setEnabled} disabled={loading} />
      </div>
      {enabled && (
        <>
          <div className="grid gap-1.5">
            <Label>Allowed at these statuses</Label>
            <MultiSelect options={initial.statuses} value={allowedAt} onChange={setAllowedAt} placeholder="Select statuses" disabled={loading} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="askReason">Ask for a reason</Label>
            <Switch id="askReason" checked={askReason} onCheckedChange={setAskReason} disabled={loading} />
          </div>
          {askReason && (
            <div className="grid gap-1.5">
              <Label htmlFor="reasons">Reasons customers can choose from</Label>
              <TagInput id="reasons" value={reasons} onChange={setReasons} placeholder="Type a reason, press Enter" disabled={loading} />
              <p className="text-xs text-muted-foreground">Customers can also pick &quot;Other&quot; and write their own.</p>
            </div>
          )}
        </>
      )}
    </SettingsModal>
  );
};

// ---------------------------------------------------------------- returns

const ReturnsModal = ({ storeId, initial, onClose }: ModalProps) => {
  const { save, loading, error } = useSave(storeId, onClose);
  const r = initial.returns;
  const [enabled, setEnabled] = useState(r.enabled);
  const [days, setDays] = useState(String(r.windowDays));
  const [statusText, setStatusText] = useState(toText(r.statuses));
  const [reasons, setReasons] = useState(r.reasons);

  const parsed = cleanStatusList(fromText(statusText), [REJECTED]);
  const n = Number(days);
  const daysOk = Number.isInteger(n) && n >= 1 && n <= 90;
  const invalid = enabled && (!parsed.ok || !daysOk);

  const onSave = () =>
    save({ returns: { enabled, ...(parsed.ok ? { statuses: parsed.list } : {}), ...(daysOk ? { windowDays: n } : {}), reasons } });

  return (
    <SettingsModal title="Returns" isOpen onClose={onClose} onSave={onSave} loading={loading} error={error} saveDisabled={invalid}>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="returnsOn">Allow returns</Label>
        <Switch id="returnsOn" checked={enabled} onCheckedChange={setEnabled} disabled={loading} />
      </div>
      {enabled && (
        <>
          <div className="grid max-w-[10rem] gap-1.5">
            <Label htmlFor="windowDays">Return window (days)</Label>
            <Input id="windowDays" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} disabled={loading} />
            {!daysOk && <p className="text-sm text-destructive">1 to 90 days</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="returnStatuses">Return statuses, in order</Label>
            <Input id="returnStatuses" value={statusText} onChange={(e) => setStatusText(e.target.value)} disabled={loading} />
            <p className="text-xs text-muted-foreground">Separate with commas. From first to last state.</p>
            {!parsed.ok && <p className="text-sm text-destructive">{parsed.error}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="returnReasons">Reasons customers can choose from</Label>
            <TagInput id="returnReasons" value={reasons} onChange={setReasons} placeholder="Type a reason, press Enter" disabled={loading} />
            <p className="text-xs text-muted-foreground">Customers can also pick &quot;Other&quot; and write their own.</p>
          </div>
        </>
      )}
    </SettingsModal>
  );
};

// ---------------------------------------------------------------- quote words

/** One label: a few common choices as chips, or the owner's own words in the box. */
const LabelPicker = ({ id, label, help, presets, value, onChange, disabled }: { id: string; label: string; help: string; presets: string[]; value: string; onChange: (v: string) => void; disabled: boolean }) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => (
        <button
          key={p}
          type="button"
          disabled={disabled}
          onClick={() => onChange(p)}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === p && "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {p}
        </button>
      ))}
    </div>
    <Input id={id} maxLength={QUOTE_LABEL_MAX} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
    <p className="text-xs text-muted-foreground">{help}</p>
  </div>
);

/** The words the store shows for price-on-request products: the checkout button of a quote, and the text in place of the price. */
const QuoteWordsModal = ({ storeId, initial, onClose }: ModalProps) => {
  const { save, loading, error } = useSave(storeId, onClose);
  const [button, setButton] = useState(initial.quote.button);
  const [priceText, setPriceText] = useState(initial.quote.priceText);
  return (
    <SettingsModal title="Quotes & enquiries" isOpen onClose={onClose} onSave={() => save({ quote: { button, priceText } })} loading={loading} error={error}>
      <p className="text-sm text-muted-foreground">
        For Price on request items, customers can request a quote right from the product page or add items in their cart to submit at checkout. Instead of paying upfront; they send a request, and you set the price on the order.
      </p>
      <LabelPicker
        id="quote-price"
        label="Text shown in place of the price"
        help="On the product page, product cards and the cart."
        presets={QUOTE_PRICE_PRESETS}
        value={priceText}
        onChange={setPriceText}
        disabled={loading}
      />
      <LabelPicker
        id="quote-button"
        label="Checkout button text"
        help="The button that sends the request, in product page and when the cart has a price-on-request product."
        presets={QUOTE_BUTTON_PRESETS}
        value={button}
        onChange={setButton}
        disabled={loading}
      />
    </SettingsModal>
  );
};

// ---------------------------------------------------------------- the section

/** The Orders settings: one row per setting. Each opens its own small form with its own Save; the payment switch saves at once. */
export const OrderSettingsCard = ({ storeId, initial }: { storeId: string; initial: OrderSettings }) => {
  const router = useRouter();
  const [paymentStep, setPaymentStep] = useState(initial.checkoutPaymentStep);
  const statuses = useOpen();
  const cancel = useOpen();
  const returns = useOpen();
  const quote = useOpen();

  const onPaymentStep = async (value: boolean) => {
    setPaymentStep(value);
    const err = await patchSettings(`/api/${storeId}/order-settings`, { checkoutPaymentStep: value });
    if (err) {
      setPaymentStep(!value);
      toast.error(err);
      return;
    }
    router.refresh();
  };

  const c = initial.cancellation;
  const r = initial.returns;
  return (
    <>
      <SettingsList>
        <PushSetting />
        <SettingRow
          title="Payment step at checkout"
          summary={paymentStep ? "Customers choose Cash on delivery" : "No payment step"}
          action={<Switch checked={paymentStep} onCheckedChange={onPaymentStep} aria-label="Payment step at checkout" />}
        />
        <SettingRow title="Order statuses" summary={initial.statuses.join(" → ")} action={<EditButton onClick={statuses.show} label="Edit order statuses" />} />
        <SettingRow
          title="Cancellation"
          summary={c.enabled ? `On · ${c.allowedAt.join(", ") || "no statuses selected"}` : "Off"}
          action={<EditButton onClick={cancel.show} label="Edit cancellation" />}
        />
        <SettingRow title="Returns" summary={r.enabled ? `On · ${r.windowDays} days` : "Off"} action={<EditButton onClick={returns.show} label="Edit returns" />} />
        <SettingRow
          title="Quotes & enquiries"
          summary={`"${initial.quote.priceText}" · button "${initial.quote.button}"`}
          action={<EditButton onClick={quote.show} label="Edit quotes and enquiries" />}
        />
      </SettingsList>
      {statuses.open && <StatusesModal storeId={storeId} initial={initial} onClose={statuses.hide} />}
      {cancel.open && <CancellationModal storeId={storeId} initial={initial} onClose={cancel.hide} />}
      {returns.open && <ReturnsModal storeId={storeId} initial={initial} onClose={returns.hide} />}
      {quote.open && <QuoteWordsModal storeId={storeId} initial={initial} onClose={quote.hide} />}
    </>
  );
};
