import { redirect } from "next/navigation";

// The home page layout is now one tab of the Pages screen. Old links and bookmarks land there.
const HomepageRedirect = async ({ params }: { params: Promise<{ storeId: string }> }) => {
  const { storeId } = await params;
  redirect(`/${storeId}/pages`);
};

export default HomepageRedirect;
