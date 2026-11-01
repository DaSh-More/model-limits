import { useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatAmount } from "../src/format";
import { validateDraft, validateDraftForTest } from "../src/source-draft";
import type { rpcContract } from "../src/rpc-contract";
import { KEY_SLOTS } from "../src/types";
import type { AccountReading, HttpSource } from "../src/types";

interface TestResult {
  reading: AccountReading | null;
  fieldPaths: string[];
}

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
      {error && <span className="text-destructive">{error}</span>}
    </label>
  );
}

export function SourceForm({
  initial,
  isNew,
  onSaved,
  onDeleted,
  onCancel,
}: {
  initial: HttpSource;
  isNew: boolean;
  onSaved: () => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [draft, setDraft] = useState<HttpSource>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof HttpSource>(k: K, v: HttpSource[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setConfirmDelete(false);
  };
  const text = (k: "organization" | "currencyPath" | "currencyFixed" | "modelPath" | "organizationPath") =>
    draft[k] ?? "";

  const test = async () => {
    const v = validateDraftForTest(draft);
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await rpc.call("source_test", v.source);
      const paths = Array.isArray(r?.fieldPaths) ? r.fieldPaths.filter((p) => typeof p === "string") : [];
      setResult({ reading: r?.reading ?? null, fieldPaths: paths });
    } catch {
      setResult(null);
      setMessage("Не удалось выполнить проверку");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const v = validateDraft(draft);
    setErrors(v.ok ? {} : v.errors);
    if (!v.ok) return;
    setBusy(true);
    setMessage(null);
    try {
      await rpc.call("source_save", v.source);
      onSaved();
    } catch {
      setMessage("Не удалось сохранить источник");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (isNew) return onCancel();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await rpc.call("source_delete", { id: draft.id });
      onDeleted();
    } catch {
      setMessage("Не удалось удалить источник");
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const pickPath = (p: string) => {
    if (draft.amountPath.trim() === "") set("amountPath", p);
  };

  const limits = Array.isArray(result?.reading?.limits) ? result.reading.limits : [];
  const balances = limits.flatMap((l) => (l.kind === "balance" ? [formatAmount(l.amount, l.currency)] : []));

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Провайдер" error={errors.providerName}>
          <Input value={draft.providerName} onChange={(e) => set("providerName", e.target.value)} />
        </Field>
        <Field label="Организация (необязательно)" error={errors.organization}>
          <Input value={text("organization")} onChange={(e) => set("organization", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Адрес (только HTTPS)" error={errors.url}>
            <Input value={draft.url} onChange={(e) => set("url", e.target.value)} />
          </Field>
        </div>
        <Field label="Заголовок" error={errors.authHeader}>
          <Input value={draft.authHeader} onChange={(e) => set("authHeader", e.target.value)} />
        </Field>
        <Field label="Префикс" error={errors.authPrefix}>
          <Input value={draft.authPrefix} onChange={(e) => set("authPrefix", e.target.value)} />
        </Field>
        <Field label="Путь к сумме" error={errors.amountPath}>
          <Input value={draft.amountPath} onChange={(e) => set("amountPath", e.target.value)} />
        </Field>
        <Field label="Путь к валюте" error={errors.currencyPath}>
          <Input value={text("currencyPath")} onChange={(e) => set("currencyPath", e.target.value)} />
        </Field>
        <Field label="Валюта (если нет в ответе)" error={errors.currencyFixed}>
          <Input value={text("currencyFixed")} onChange={(e) => set("currencyFixed", e.target.value)} />
        </Field>
        <Field label="Путь к организации (необязательно)" error={errors.organizationPath}>
          <Input value={text("organizationPath")} onChange={(e) => set("organizationPath", e.target.value)} />
        </Field>
        <Field label="Путь к модели (необязательно)" error={errors.modelPath}>
          <Input value={text("modelPath")} onChange={(e) => set("modelPath", e.target.value)} />
        </Field>
        <Field label="Поле с ключом" error={errors.keySlot}>
          <select
            className={SELECT_CLASS}
            value={draft.keySlot}
            onChange={(e) => set("keySlot", e.target.value as HttpSource["keySlot"])}
          >
            {KEY_SLOTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {result && (
        <div className="space-y-2 rounded-md bg-muted p-3 text-xs">
          {result.reading?.status === "ok" ? (
            <p>{`Разобрано: баланс ${balances.join(", ") || "—"}`}</p>
          ) : (
            <p className="text-destructive">{result.reading?.message ?? "Не удалось разобрать ответ"}</p>
          )}
          {result.fieldPaths.length > 0 && (
            <>
              <p className="text-muted-foreground">Поля ответа (значения не передаются):</p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 font-mono">
                {result.fieldPaths.map((p) => (
                  <li key={p}>
                    <button type="button" className="cursor-pointer hover:underline" onClick={() => pickPath(p)}>
                      {p}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {message && <p className="text-xs text-destructive">{message}</p>}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={test}>
          Проверить
        </Button>
        <Button size="sm" disabled={busy} onClick={save}>
          Сохранить
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Отмена
        </Button>
        {!isNew && (
          <Button
            className="ml-auto"
            size="sm"
            variant={confirmDelete ? "destructive" : "outline"}
            disabled={busy}
            onClick={remove}
          >
            {confirmDelete ? "Точно удалить?" : "Удалить"}
          </Button>
        )}
      </div>
    </div>
  );
}
