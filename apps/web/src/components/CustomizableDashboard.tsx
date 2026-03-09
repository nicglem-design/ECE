"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useWalletBalances } from "@/hooks/useWallet";
import { useProfile } from "@/hooks/useProfile";
import { getCurrencySymbol } from "@/lib/currencies";
import { getPricesBatch } from "@/lib/coingecko";
import { TopCryptoWidget } from "@/components/TopCryptoWidget";
import { PopularCryptoWidget } from "@/components/PopularCryptoWidget";
import { DashboardReceiveWidget } from "@/components/DashboardReceiveWidget";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  ALL_WIDGET_IDS,
  WIDGET_LABELS,
  type WidgetId,
} from "@/lib/dashboard-widgets";
import { useEffect } from "react";

function SortableWidget({
  id,
  children,
  isEditMode,
  onRemove,
}: {
  id: WidgetId;
  children: React.ReactNode;
  isEditMode: boolean;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${isDragging ? "opacity-50 z-50" : ""}`}
    >
      {isEditMode && (
        <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="rounded bg-slate-700 p-1.5 text-slate-400 hover:bg-slate-600 hover:text-slate-200 cursor-grab active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M4 16h16" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded bg-red-500/20 p-1.5 text-red-400 hover:bg-red-500/30"
            aria-label="Remove widget"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

export function CustomizableDashboard() {
  const { t } = useLanguage();
  const { currency } = useCurrency();
  const { profile, updateProfile } = useProfile();
  const { assets } = useWalletBalances();
  const [totalValue, setTotalValue] = useState<number | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);

  const layout = (profile?.dashboardLayout?.length
    ? profile.dashboardLayout.filter((id) => ALL_WIDGET_IDS.includes(id as WidgetId))
    : [...DEFAULT_DASHBOARD_LAYOUT]) as WidgetId[];

  const setLayout = useCallback(
    (newLayout: WidgetId[]) => {
      updateProfile({ dashboardLayout: newLayout });
    },
    [updateProfile]
  );

  const fetchTotal = useCallback(() => {
    if (assets.length === 0) {
      setTotalValue(0);
      return;
    }
    getPricesBatch(assets.map((a) => a.chainId), currency || "usd").then((prices) => {
      const total = assets.reduce((sum, a) => {
        const price = prices[a.chainId] ?? 0;
        return sum + parseFloat(a.amount) * price;
      }, 0);
      setTotalValue(total);
    });
  }, [assets, currency]);

  useEffect(() => {
    fetchTotal();
    const id = setInterval(fetchTotal, 5000);
    return () => clearInterval(id);
  }, [fetchTotal]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = layout.indexOf(active.id as WidgetId);
      const newIndex = layout.indexOf(over.id as WidgetId);
      if (oldIndex !== -1 && newIndex !== -1) {
        setLayout(arrayMove(layout, oldIndex, newIndex));
      }
    }
  }

  function handleRemove(id: WidgetId) {
    setLayout(layout.filter((w) => w !== id));
  }

  function handleAdd(id: WidgetId) {
    if (!layout.includes(id)) {
      setLayout([...layout, id]);
    }
    setShowAddPicker(false);
  }

  const sym = getCurrencySymbol(currency || "usd");
  const availableToAdd = ALL_WIDGET_IDS.filter((id) => !layout.includes(id));

  function renderWidget(id: WidgetId) {
    switch (id) {
      case "need-help":
        return (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("kano-open"))}
            className="flex w-full items-center justify-between rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-4 text-left transition hover:border-sky-500/30 hover:bg-slate-800/30"
          >
            <div>
              <h3 className="font-medium text-sky-400">{t("dashboard.needHelp")}</h3>
              <p className="mt-1 text-sm text-slate-400">{t("dashboard.needHelpDesc")}</p>
            </div>
          </button>
        );
      case "balance":
        return (
          <Link
            href="/wallet"
            className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-sky-500/50"
          >
            <span className="text-slate-400">{t("dashboard.balance")}</span>
            <span className="mt-2 font-mono text-xl font-semibold text-slate-200">
              {totalValue != null ? `${sym} ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
            </span>
            <span className="mt-2 text-sm text-sky-400">Open KanoWallet →</span>
          </Link>
        );
      case "swap":
        return (
          <Link
            href="/exchange"
            className="flex flex-col rounded-xl border border-amber-500/30 bg-amber-500/15 backdrop-blur-xl p-6 transition hover:border-amber-500/40 hover:bg-amber-500/20"
          >
            <span className="text-amber-400">{t("dashboard.swap")}</span>
            <p className="mt-2 text-slate-400">Trade on KanoExchange</p>
          </Link>
        );
      case "receive":
        return <DashboardReceiveWidget />;
      case "top-crypto":
        return <TopCryptoWidget />;
      case "popular-crypto":
        return <PopularCryptoWidget />;
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">Dashboard</h2>
        <button
          type="button"
          onClick={() => setIsEditMode(!isEditMode)}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            isEditMode ? "bg-sky-500 text-white" : "border border-slate-600 text-slate-400 hover:bg-slate-800"
          }`}
        >
          {isEditMode ? "Done" : "Customize"}
        </button>
      </div>

      {isEditMode && (
        <div className="flex flex-wrap gap-2">
          {availableToAdd.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setShowAddPicker(!showAddPicker)}
                className="rounded-lg border border-dashed border-slate-600 px-4 py-2 text-sm text-slate-400 hover:border-sky-500/50 hover:text-sky-400"
              >
                + Add widget
              </button>
              {showAddPicker && (
                <div className="flex flex-wrap gap-2">
                  {availableToAdd.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleAdd(id)}
                      className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700"
                    >
                      {WIDGET_LABELS[id]}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">All widgets added. Remove one to add another.</p>
          )}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={layout} strategy={verticalListSortingStrategy}>
          <div className="space-y-6">
            {layout.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-600 p-12 text-center text-slate-500">
                <p className="mb-4">No widgets. Add some to customize your dashboard.</p>
                {isEditMode && availableToAdd.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAddPicker(true)}
                    className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
                  >
                    Add widget
                  </button>
                )}
              </div>
            ) : (
              layout.map((id) => (
                <SortableWidget
                  key={id}
                  id={id}
                  isEditMode={isEditMode}
                  onRemove={() => handleRemove(id)}
                >
                  {renderWidget(id)}
                </SortableWidget>
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
