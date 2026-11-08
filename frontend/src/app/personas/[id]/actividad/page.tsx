import { Suspense } from "react";
import { ActivityView } from "./activity-view";

export default function Page() {
  return (
    <Suspense>
      <ActivityView />
    </Suspense>
  );
}
