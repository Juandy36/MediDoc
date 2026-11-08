import { Suspense } from "react";
import { PersonView } from "./person-view";

export default function Page() {
  return (
    <Suspense>
      <PersonView />
    </Suspense>
  );
}
