import { ItemLocationPage } from "@/components/item/item-location-page";

export const metadata = { title: "Lokasi item" };

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemLocationPage id={id} />;
}
