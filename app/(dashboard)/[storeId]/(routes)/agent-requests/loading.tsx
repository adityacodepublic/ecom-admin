import { HeadingLoading, PageFrame, SeparatorLoading } from "@/components/loading/page-loadings";

/** An agent request opens as a dialog over its page: until it is read, the heading every page starts with. */
const Loading = () => (
  <PageFrame fluid>
    <HeadingLoading titleW="w-40" descW="w-[190px]" wrapDesc={false} />
    <SeparatorLoading />
  </PageFrame>
);

export default Loading;
