import prismadb from "@/lib/prismadb";

import { FilterForm } from "./components/filter-form";

const FilterPage = async ({
  params
}: {
  params: { filterId: string, storeId: string}
}) => {
  const filter = await prismadb.filter.findUnique({
    where: {
      id: params.filterId
    },
    select:{
      id:true,
      name:true,
      feature:true,
      value:{
        select:{  
          value:true,
          unit:true,
        }
      },
      filterGroupItems:{
        select:{
          FilterGroup:{
            select:{
              id:true,
              name:true
            }
          }
        }
      }
    },
  });

  const filterGroup = await prismadb.filterGroup.findMany({
    where: {
      storeId: params.storeId
    },
    select:{
      id:true,
      name:true
    }
  })


  return ( 
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <FilterForm initialData={filter} filterGroup={filterGroup} />
      </div>
    </div>
  );
}

export default FilterPage;
