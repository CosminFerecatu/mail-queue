'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function Loading() {
  return (
    <>
      <header className="flex h-14 items-center justify-between border-b bg-background px-6">
        <div>
          <Skeleton className="h-6 w-20 mb-1" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </header>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            <Skeleton className="h-9 w-[150px]" />
            <Skeleton className="h-9 w-[180px]" />
            <Skeleton className="h-9 w-[180px]" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="p-4 space-y-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={`skeleton-${i}`} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
