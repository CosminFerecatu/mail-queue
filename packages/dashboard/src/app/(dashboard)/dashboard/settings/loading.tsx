'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function Loading() {
  return (
    <>
      <header className="flex h-14 items-center justify-between border-b bg-background px-6">
        <div>
          <Skeleton className="h-6 w-24 mb-1" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </header>
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={`field-${i}`} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
            <Skeleton className="h-9 w-32" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
