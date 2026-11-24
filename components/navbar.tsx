import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

import StoreSwitcher from "@/components/store-switcher";
import { MainNav } from "@/components/main-nav";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import prismadb from "@/lib/prismadb";

const Navbar = async () => {
  const { userId, redirectToSignIn } = await auth();

  if (!userId) {
    return redirectToSignIn();
  }

  const stores = await prismadb.store.findMany({
    where: {
      userId,
    },
    // Client component below: send only what the switcher shows (never the whole row, e.g. agentAccess).
    select: { id: true, name: true },
  });

  return (
    <div className="border-b">
      <div className="flex h-16 items-center px-4">
        <StoreSwitcher items={stores} />
        <MainNav className="mx-6" />
        <div className="ml-auto flex items-center space-x-4">
          <div className="lg:hidden">
            <MobileNav />
          </div>
          <ThemeToggle />
          <UserButton />
        </div>
      </div>
    </div>
  );
};

export default Navbar;
