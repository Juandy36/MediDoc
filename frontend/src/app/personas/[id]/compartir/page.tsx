import { Suspense } from "react";
import { ShareView } from "./share-view";

export default function Page() {
  return (
    <Suspense>
      <ShareView />
    </Suspense>
  );
}
