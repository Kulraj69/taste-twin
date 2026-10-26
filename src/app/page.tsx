import { connection } from "next/server";
import { TasteApp } from "@/components/taste-app";
import { createPlan } from "@/lib/plan";
import { QlooClient } from "@/lib/qloo";
import { MOCK_EXAMPLES } from "@/mock/qloo";

export default async function HomePage() {
  await connection();
  const mode = process.env.QLOO_API_KEY?.trim() ? "live" : "mock";
  // The initial preview is explicitly synthetic in either mode. Never call Qloo
  // or Nebius during rendering, prefetching or builds; paid work requires POST.
  const preview = await createPlan({ favourites: MOCK_EXAMPLES[0].favourites, city: "Lisbon" }, { qloo: new QlooClient() });
  return <TasteApp mode={mode} preview={preview} />;
}
