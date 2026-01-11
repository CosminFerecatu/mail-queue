'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-1" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={`stat1-${i}`} />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatCardSkeleton key={`stat2-${i}`} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-28 mb-1" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-28 mb-1" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={`action-${i}`} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
