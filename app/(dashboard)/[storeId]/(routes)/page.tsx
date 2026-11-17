import { requireStoreOwnerPage } from "@/lib/api/admin-auth";
import { CreditCard, DollarSign, Package } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Overview } from "@/components/overview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { getTotalRevenue } from "@/actions/get-total-revenue";
import { getSalesCount } from "@/actions/get-sales-count";
import { getGraphRevenue } from "@/actions/get-graph-revenue";
import { getStockCount } from "@/actions/get-stock-count";
import { formatINR } from "@/lib/money";
import { getOrderStats } from "@/lib/orders/queries";
import { OrderStatsCards } from "@/components/orders/order-stats-cards";

interface DashboardPageProps {
  params: Promise<{
    storeId: string;
  }>;
}

const DashboardPage: React.FC<DashboardPageProps> = async ({ params }) => {
  const resolvedParams = await params;
  await requireStoreOwnerPage(resolvedParams.storeId);
  const totalRevenue = await getTotalRevenue(resolvedParams.storeId);
  const graphRevenue = await getGraphRevenue(resolvedParams.storeId);
  const salesCount = await getSalesCount(resolvedParams.storeId);
  const stockCount = await getStockCount(resolvedParams.storeId);
  const orderStats = await getOrderStats(resolvedParams.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <Heading title="Dashboard" description="Overview of your store" />
        <Separator />
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Revenue
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatINR(totalRevenue)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sales</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{salesCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Products In Stock
              </CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stockCount}</div>
            </CardContent>
          </Card>
        </div>
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <Overview data={graphRevenue} />
          </CardContent>
        </Card>
        <OrderStatsCards storeId={resolvedParams.storeId} stats={orderStats} />
      </div>
    </div>
  );
};

export default DashboardPage;
