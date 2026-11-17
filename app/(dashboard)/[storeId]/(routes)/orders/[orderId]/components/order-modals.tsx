"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import { toast } from "react-hot-toast";
import { AlertTriangle, Lock } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdminOrder } from "@/lib/orders/queries";
import { PRIVATE_NOTE_MAX } from "@/lib/orders/details";
import { CANCELLED, COD, PAYMENT_STATUSES, PAYMENT_STATUS_LABELS, REJECTED } from "@/lib/orders/status";

const MarkdownEditor = dynamic(() => import("@/components/ui/markdown-editor"), {
  ssr: false,
  loading: () => <div className="h-32 rounded-md border bg-muted/40" />,
});

type FieldErrors = Record<string, string>;

/**
 * Every small modal sends only its own fields in one PATCH (the API takes any subset).
 * Returns the save action plus the loading and error state, so each modal stays short.
 */
export function useOrderPatch(order: AdminOrder, onClose: () => void) {
  const router = useRouter();
  const { storeId } = useParams<{ storeId: string }>();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const save = async (body: Record<string, unknown>) => {
    setFormError("");
    setFieldErrors({});
    if (Object.keys(body).length === 0) {
      setFormError("Nothing to save: change something first.");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/${storeId}/orders/${order.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err = data?.error;
        setFormError(err?.message || "Could not save the order. Try again.");
        const fe = err?.details?.fieldErrors as Record<string, string[]> | undefined;
        if (fe) setFieldErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]])));
        return;
      }
      toast.success(data?.changed ? "Order updated." : "Nothing changed.");
      onClose();
      router.refresh();
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return { save, loading, formError, fieldErrors };
}

type ShellProps = {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  formError: string;
  onSave: () => void;
  saveLabel?: string;
  destructive?: boolean;
  wide?: boolean;
  children: ReactNode;
};

const Shell = ({ title, description, isOpen, onClose, loading, formError, onSave, saveLabel, destructive, wide, children }: ShellProps) => (
  <Modal
    title={title}
    description={description ?? ""}
    isOpen={isOpen}
    onClose={onClose}
    className={wide ? "max-h-[90vh] overflow-y-auto sm:max-w-2xl" : "max-h-[90vh] overflow-y-auto sm:max-w-md"}
  >
    <div className="space-y-4">
      {children}
      {formError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{formError}</div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={loading} onClick={onClose}>
          Close
        </Button>
        <Button disabled={loading} variant={destructive ? "destructive" : "default"} onClick={onSave}>
          {loading ? "Saving..." : saveLabel ?? "Save"}
        </Button>
      </div>
    </div>
  </Modal>
);

type ModalProps = { order: AdminOrder; isOpen: boolean; onClose: () => void };

// ---------------------------------------------------------------- Status

/** Cancel the order (confirmation only). Stock is not changed: the admin restores it later with a button. */
export const CancelModal = ({ order, isOpen, onClose }: ModalProps) => {
  const { save, loading, formError } = useOrderPatch(order, onClose);
  return (
    <Shell
      title={`Cancel order #${order.orderNumber}?`}
      isOpen={isOpen}
      onClose={onClose}
      loading={loading}
      formError={formError}
      onSave={() => save({ status: CANCELLED })}
      destructive
      saveLabel="Cancel order"
    >
      <div className="flex gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Cancelling cannot be undone. Stock is not changed: restore it from the order page when the items are back.</span>
      </div>
    </Shell>
  );
};

/** Reject the return (it ends there). Nothing else changes: stock and payment stay as they are. */
export const RejectReturnModal = ({ order, isOpen, onClose }: ModalProps) => {
  const { save, loading, formError } = useOrderPatch(order, onClose);
  return (
    <Shell
      title="Reject this return?"
      isOpen={isOpen}
      onClose={onClose}
      loading={loading}
      formError={formError}
      onSave={() => save({ returnStatus: REJECTED })}
      destructive
      saveLabel="Reject return"
    >
      <div className="flex gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Rejecting cannot be undone. The customer keeps the items, and stock and payment are not changed.</span>
      </div>
    </Shell>
  );
};

/** An old return status (not in the return list any more): pick a current one to replace it. */
export const ReplaceReturnModal = ({ order, isOpen, onClose }: ModalProps) => {
  const { save, loading, formError, fieldErrors } = useOrderPatch(order, onClose);
  const [status, setStatus] = useState<string>(order.returnStatuses[0]);
  return (
    <Shell
      title="Update return status"
      description={`"${order.return?.status}" is not in your return statuses any more. Pick the current status of this return.`}
      isOpen={isOpen}
      onClose={onClose}
      loading={loading}
      formError={formError}
      onSave={() => save({ returnStatus: status })}
    >
      <div className="grid gap-2">
        <Label>Return status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {order.returnStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.returnStatus && <p className="text-sm text-destructive">{fieldErrors.returnStatus}</p>}
      </div>
    </Shell>
  );
};

/** An old status (not in the current list any more): pick a current one to replace it. */
export const ReplaceStatusModal = ({ order, isOpen, onClose }: ModalProps) => {
  const { save, loading, formError, fieldErrors } = useOrderPatch(order, onClose);
  const [status, setStatus] = useState<string>(order.statuses[0]);
  return (
    <Shell
      title="Update status"
      description={`"${order.status}" is not in your status list any more. Pick the current status of this order.`}
      isOpen={isOpen}
      onClose={onClose}
      loading={loading}
      formError={formError}
      onSave={() => save({ status })}
    >
      <div className="grid gap-2">
        <Label>Status</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {order.statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors.status && <p className="text-sm text-destructive">{fieldErrors.status}</p>}
      </div>
    </Shell>
  );
};

// ---------------------------------------------------------------- Expected delivery

export const DeliveryModal = ({ order, isOpen, onClose }: ModalProps) => {
  const { save, loading, formError, fieldErrors } = useOrderPatch(order, onClose);
  const [date, setDate] = useState(order.expectedDelivery ?? "");

  const onSave = () => {
    const next = date || null;
    return save(next !== order.expectedDelivery ? { expectedDelivery: next } : {});
  };

  return (
    <Shell
      title="Expected delivery"
      description="The customer sees this date on their order page."
      isOpen={isOpen}
      onClose={onClose}
      loading={loading}
      formError={formError}
      onSave={onSave}
    >
      <div className="grid gap-1">
        <Label htmlFor="expected">Date</Label>
        <Input id="expected" type="date" className="dark:[color-scheme:dark]" value={date} onChange={(e) => setDate(e.target.value)} />
        <p className="text-xs text-muted-foreground">Leave it empty to remove the date.</p>
        {fieldErrors.expectedDelivery && <p className="text-sm text-destructive">{fieldErrors.expectedDelivery}</p>}
      </div>
    </Shell>
  );
};

// ---------------------------------------------------------------- Payment

export const PaymentModal = ({ order, isOpen, onClose }: ModalProps) => {
  const { save, loading, formError, fieldErrors } = useOrderPatch(order, onClose);
  const [payment, setPayment] = useState(order.payment);
  const [paymentStatus, setPaymentStatus] = useState<string>(order.paymentStatus);
  const options = PAYMENT_STATUSES;

  const onSave = () => {
    const body: Record<string, unknown> = {};
    if (payment.trim() !== order.payment) body.payment = payment.trim();
    if (paymentStatus !== order.paymentStatus) body.paymentStatus = paymentStatus;
    return save(body);
  };

  return (
    <Shell title="Payment" isOpen={isOpen} onClose={onClose} loading={loading} formError={formError} onSave={onSave}>
      <div className="grid gap-1">
        <Label htmlFor="payment">Payment method</Label>
        <Input
          id="payment"
          maxLength={50}
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
          placeholder="UPI, Bank transfer, ..."
          list="payment-methods"
        />
        <datalist id="payment-methods">
          <option value={COD} />
          <option value="UPI" />
          <option value="Bank transfer" />
        </datalist>
        {fieldErrors.payment && <p className="text-sm text-destructive">{fieldErrors.payment}</p>}
      </div>
      <div className="grid gap-1">
        <Label>Payment status</Label>
        <Select value={paymentStatus} onValueChange={setPaymentStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((s) => (
              <SelectItem key={s} value={s}>
                {PAYMENT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Shell>
  );
};

// ---------------------------------------------------------------- Notes (admin only)

export const NotesModal = ({ order, isOpen, onClose }: ModalProps) => {
  const { save, loading, formError, fieldErrors } = useOrderPatch(order, onClose);
  const [note, setNote] = useState(order.privateNote ?? "");

  const onSave = () => {
    const next = note.trim() ? note : null;
    return save(next !== order.privateNote ? { privateNote: next } : {});
  };

  return (
    <Shell
      title="Notes"
      description="Only you can see this. The customer never sees it."
      isOpen={isOpen}
      onClose={onClose}
      loading={loading}
      formError={formError}
      onSave={onSave}
    >
      <div className="grid gap-2">
        <Label htmlFor="notes" className="flex items-center gap-1">
          <Lock className="h-3.5 w-3.5" /> Notes
        </Label>
        <textarea
          id="notes"
          rows={6}
          maxLength={PRIVATE_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="For example: Customer asked to deliver after 6 pm."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-right text-xs text-muted-foreground">
          {note.length} / {PRIVATE_NOTE_MAX}
        </p>
        {fieldErrors.privateNote && <p className="text-sm text-destructive">{fieldErrors.privateNote}</p>}
      </div>
    </Shell>
  );
};

// ---------------------------------------------------------------- Message to the customer

export const MessageModal = ({ order, isOpen, onClose }: ModalProps) => {
  const { save, loading, formError, fieldErrors } = useOrderPatch(order, onClose);
  const [content, setContent] = useState(order.adminContent ?? "");

  const onSave = () => {
    const next = content.trim() ? content : null;
    return save(next !== order.adminContent ? { adminContent: next } : {});
  };

  return (
    <Shell
      title="Message to customer"
      description="Shown on the customer's order page. You can add pictures."
      isOpen={isOpen}
      onClose={onClose}
      loading={loading}
      formError={formError}
      onSave={onSave}
      wide
    >
      <div className="grid gap-2">
        <MarkdownEditor value={order.adminContent ?? ""} onChange={setContent} />
        {fieldErrors.adminContent && <p className="text-sm text-destructive">{fieldErrors.adminContent}</p>}
      </div>
    </Shell>
  );
};
