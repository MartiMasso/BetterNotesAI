import PricingClient from "./PricingClient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type PageProps = {
    searchParams?: SearchParams;
};

export default async function PricingPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const success = params?.success === "1";
    const canceled = params?.canceled === "1";
    const sessionIdRaw = params?.session_id;
    const sessionId = Array.isArray(sessionIdRaw) ? sessionIdRaw[0] : sessionIdRaw;

    return <PricingClient success={success} canceled={canceled} sessionId={sessionId} />;
}
