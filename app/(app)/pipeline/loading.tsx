import { ListSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <ListSkeleton rows={4} chips={5} />;
}
