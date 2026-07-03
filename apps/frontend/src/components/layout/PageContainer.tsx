import { cn } from '@/shared/lib/cn';

type PageVariant = 'wide' | 'form' | 'compact';

const variantClass: Record<PageVariant, string> = {
  wide:    'mx-auto w-full max-w-[1760px]',
  form:    'mx-auto w-full max-w-3xl',
  compact: 'mx-auto w-full max-w-xl',
};

interface PageContainerProps {
  variant?: PageVariant;
  fillHeight?: boolean;
  noPadding?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function PageContainer({
  variant = 'wide',
  fillHeight = false,
  noPadding = false,
  className,
  children,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        variantClass[variant],
        !noPadding && 'px-4 py-6 sm:px-6 lg:px-8',
        fillHeight && 'flex min-h-0 flex-1 flex-col',
        className,
      )}
    >
      {children}
    </div>
  );
}
