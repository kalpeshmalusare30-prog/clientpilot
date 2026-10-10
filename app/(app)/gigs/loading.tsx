import { ListSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <ListSkeleton rows={6} chips={4} />;
}
