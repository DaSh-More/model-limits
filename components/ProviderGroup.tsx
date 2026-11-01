import { formatAge, statusNote } from "../src/format";
import type { AccountNode, Device, ProviderNode } from "../src/types";
import { LimitRow } from "./LimitRow";

function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{children}</span>
  );
}

function AccountTags({ account }: { account: AccountNode }) {
  const names = account.devices.map((d: Device) => ("service" in d ? "сервис" : d.name));
  return (
    <>
      {names.map((n) => (
        <Tag key={n}>{n}</Tag>
      ))}
      {account.planLabel && <Tag>{account.planLabel}</Tag>}
      {account.offline && <Tag>не в сети</Tag>}
    </>
  );
}

function AccountBody({ account: raw, now }: { account: AccountNode; now: Date }) {
  const account = { ...raw, limits: Array.isArray(raw.limits) ? raw.limits : [] };
  const note = statusNote(account.status, account.message);
  const failed = account.status === "error";
  return (
    <div className="space-y-2">
      {failed && (
        <p className="text-xs text-destructive">
          {`Ошибка источника: ${account.message ?? "неизвестная ошибка"}.`}
          {account.limits.length > 0 && ` Показаны данные ${formatAge(account.fetchedAt, now).replace(/^обновлено /, "")}`}
        </p>
      )}
      {account.status === "not_installed" && (
        <p className="text-xs text-muted-foreground">не установлен</p>
      )}
      {note !== null && <p className="text-xs text-muted-foreground">{note}</p>}
      {account.status === "ok" && account.limits.length === 0 && (
        <p className="text-xs text-muted-foreground">лимиты не сообщаются</p>
      )}
      {account.limits.map((l) => (
        <LimitRow key={l.id} limit={l} fetchedAt={account.fetchedAt} now={now} />
      ))}
    </div>
  );
}

export function ProviderGroup({ provider, now }: { provider: ProviderNode; now: Date }) {
  const accounts = Array.isArray(provider.accounts) ? provider.accounts : [];
  const hints = Array.isArray(provider.hints) ? provider.hints : [];
  const single = accounts.length === 1 ? accounts[0] : null;
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">{provider.name}</h2>
        {single && <AccountTags account={single} />}
      </header>
      {single ? (
        <AccountBody account={single} now={now} />
      ) : (
        accounts.map((a) => (
          <div key={a.key} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">{a.label ?? "Аккаунт"}</h3>
              <AccountTags account={a} />
            </div>
            <AccountBody account={a} now={now} />
          </div>
        ))
      )}
      {hints.map((h) => (
        <p key={h.hostId} className="text-xs text-warning-text">{h.text}</p>
      ))}
    </section>
  );
}
