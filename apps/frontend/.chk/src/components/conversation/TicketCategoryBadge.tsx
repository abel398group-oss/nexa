import React from 'react';
import { getCategoryConfig, getPriorityConfig } from '@/shared/lib/ticket-category';

interface Props {
  category?: string | null;
  priority?: string | null;
  compact?: boolean; // só ícone + label curto
}

export function TicketCategoryBadge({ category, priority }: Props) {
  const cat = getCategoryConfig(category);
  const pri = getPriorityConfig(priority);

  if (!cat && !pri) return null;

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {cat && (
        <span
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${cat.color} ${cat.textColor}`}
          title={cat.label}
        >
          <span>{cat.label}</span>
        </span>
      )}
      {pri && (
        <span
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${pri.color} ${pri.textColor}`}
          title={`Prioridade: ${pri.label}`}
        >
          <span>{pri.label}</span>
        </span>
      )}
    </span>
  );
}
