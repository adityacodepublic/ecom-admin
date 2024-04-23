
import prismadb from "./lib/prismadb"


async function main() {
    // const orders = await prismadb.order.findMany();
    const users = await prismadb.product.findFirst({
        select:{
            images:true,
        }
    });

    
    // const addresses = users.map((item)=>(item.address.map((item2)=>(item2))));

    // for (const ord of orders) {
    //   console.log(ord.createdAt);

    //   for(const item of users){
    //     for(const items of item.address){
    //       if(ord.addressId== items.id){
    //         console.log(items.value);
    //       }
    //     }
    //   }
    // }
      


//     if (user!=null){
//             try {
//             for (const item of user ){
//                 await prismadb.billboardImage.create({
//                     data:{
//                         billboardId:item.billboardId || "no IDDDDDDD",
//                         url:item.url
//                     },
//                 })
//                 console.log(`created billboard image with billboard id ${item.billboardId} and url ${item.url.slice(0,10)}`)
                
//             }
//     } catch (error) {
//         console.log("error 1")
//     }
// }


    
    console.log(users);

}



main();
console.log("hi")
//     .catch(e => {
//         console.error(e.message)
//     })
//     .finally(async () => {
//         await prismadb.$disconnect()
//     })
// /*
//     //check user
//     const user = await prismadb.users.findUnique({
//         where:{
//             id:"usersId",
//         },
//     });

//     if (user==null){ 
//         const user = await prismadb.users.create({
//             data:{
//                 id:"usersId",
//                 storeId:"params.storeId",
//                 email:"email",
//                 fname:"fname",
//                 imgurl:"imgurl",
//             }
//         })
//     }
//     else{
//     //compare data

//         if (user?.email!=email){
//             await prismadb.users.update({
//                 where:{
//                     id:usersId,
//                 },
//                 data:{
//                     email:email,
//                 },
//             })
//         } 
//         if (user?.fname!=fname){
//             await prismadb.users.update({
//                 where:{
//                     id:usersId,
//                 },
//                 data:{
//                     fname:fname,
//                 },
//             })
//         } 
//     //     if (user?.imgurl!=imgurl){
//     //     await prismadb.users.update({
//     //         where:{
//     //             id:usersId,
//     //         },
//     //         data:{
//     //             imgurl:imgurl,
//     //         },
//     //     })
//     // } 
//     }
//     create order and connect user id 
//     const user = await prismadb.order.create({
//         data:{
//             storeId:"757945cd-8675-46c4-b999-d7a7bcbec812",
//             usersId:"test1",
//             address:"hi",
//             isPaid:true,
//             status:"shipped",
//         }
//     })
//     //add user also if needed 

//     webhook 
//     //update details 
//     //and include if needed 

// */






// /*  
//     //include what you want to const 
//     ********************FIND********************* findUnique findFirst FindMany
//                                                   distinct: ["name", "email"]  take:2,  skip:1,
//                                                   orderBy:{
//                                                     createdAt: "asc",
//                                                   },
//                                                   where{ 
//                                                     name:{equals:""}  or {not:""}
//                                                     name:{in:["one","four"]}   or notIn
//                                                     age:{lt:20},   //less than gt, lte, gte //can combine all where

//                                                     email:{contains:"@test.in"}   // endsWith or startsWith
//                                                   }

//                                                   use AND NOT OR
//                                                   where{
//                                                     AND[
//                                                         {//query here in braces},
//                                                     ]
//                                                   }
//                                                   // is isNot
//                                                   query sub elements of a model also

                                         
//     const user = await prismadb.users.findMany({
//         where:{
//             orders:{
//                 some:{
//                     isPaid:true,
//                 }
//             }
//         },
//         include:{
//             orders:true,
//         }
//     }); 


//     const user = await prismadb.users.findUnique({
//         where:{
//             id:"test2",
//         }
//     });




//     *******************CREATE********************

//     const user = await prismadb.users.create({
//         data:{
//             id:"test2",
//             storeId:"757945cd-8675-46c4-b999-d7a7bcbec812",
//             imgurl:"hhjgjuyfut",
//         }
//     })


//     const user = await prismadb.order.create({
//         data:{
//             storeId:"757945cd-8675-46c4-b999-d7a7bcbec812",
//             usersId:"test1",
//             address:"hi",
//             isPaid:true,
//             status:"shipped",
//         }
//     })

//     //include   or select { name:true }   //for specfic
//     const user = await prismadb.order.create({
//         data:{
//             storeId:"757945cd-8675-46c4-b999-d7a7bcbec812",
//             usersId:'test2',
//             address:"hi hello",
//             isPaid:true,

//         },
//         include:{
//             users:true,
//         }
//     });
//       ********************UPDATE********************
//     const user = await prismadb.order.update({
//         where:{
//             id:"c95d6085-0d22-4a3d-ae4b-92c959248cf0",
//         },
//         data:{
//             address:"hi",
//             isPaid:true,
//             status:"shipped",
//             users:{
//                 connect:{
//                     id:"test2"
//                 }
//             }
//         }
//     })


// {log:["query"]}
// */