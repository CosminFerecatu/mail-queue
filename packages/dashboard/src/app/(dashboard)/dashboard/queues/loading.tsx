'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function Loading() {
  return (
    <>
      <header className="flex h-14 items-center justify-between border-b bg-background px-6">
        <div>
          <Skeleton className="h-6 w-20 mb-1" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </header>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-6 w-28 mb-1" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="p-4 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={`skeleton-${i}`} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
