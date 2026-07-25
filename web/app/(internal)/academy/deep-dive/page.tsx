import { ExplainerPage } from "@/components/docs/explainer/ExplainerPage";

export const metadata = {
  title: "Deep Dive | AxonFlux Academy",
};

// The narrative system-design explainer, now an Academy section.
// Academy data modules (lib/academy) are canonical for concepts/interview/
// roadmap; this page is the guided story — hero, pipeline walkthrough,
// SQL deep dive, failure cases, scaling, changelog.
export default function DeepDivePage() {
  return <ExplainerPage />;
}
