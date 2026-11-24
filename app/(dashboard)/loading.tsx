import { NavbarLoading } from "@/components/loading/navbar-loading";
import { HeadingLoading, PageFrame, SeparatorLoading } from "@/components/loading/page-loadings";

/** While the store's layout checks the owner and loads the navbar: the navbar, and the heading every page starts with. */
const Loading = () => (
  <>
    <NavbarLoading />
    <PageFrame fluid>
      <HeadingLoading titleW="w-40" descW="w-[190px]" wrapDesc={false} />
      <SeparatorLoading />
    </PageFrame>
  </>
);

export default Loading;
