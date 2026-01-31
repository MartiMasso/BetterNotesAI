import PricingClient from "./PricingClient";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams;
};

export default function PricingPage({ searchParams }: PageProps) {
  const success = searchParams?.success === "1";
  const canceled = searchParams?.canceled === "1";

  return <PricingClient success={success} canceled={canceled} />;
}
