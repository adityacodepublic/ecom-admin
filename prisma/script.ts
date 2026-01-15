import prismadb from "@/lib/prismadb";

const colors = [
  {
    id: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
    name: "Silver",
    valueid: "cmkf45oqp000014a0fx1ke79d",
  },
  {
    id: "0fe05315-dada-4815-834b-30ce99a64bc5",
    name: "light green",
    valueid: "cmkf45oqs000114a0qdtavq5j",
  },
  {
    id: "34d3fd5b-7e79-41da-8604-940bdc1cb34b",
    name: "Silver",
    valueid: "cmkf45oqp000014a0fx1ke79d",
  },
  {
    id: "54cd8f16-1785-4806-95e5-6f46441f59fe",
    name: "Grey",
    valueid: "cmkf45oqs000214a048tsnjqp",
  },
  {
    id: "56f7cb57-8f5d-4db5-bf4b-7f5b2b5d8d01",
    name: "light blue",
    valueid: "cmkf45oqs000314a0u79qb9po",
  },
  {
    id: "5e2462fb-f8e7-4562-92f1-856158b50cd6",
    name: "pink",
    valueid: "cmkf45oqt000414a0eu5bmyq2",
  },
  {
    id: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
    name: "Black",
    valueid: "cmkf45oqt000514a0gep09fif",
  },
  {
    id: "781009d9-8688-4d55-9544-42874e6cc6ec",
    name: "purple",
    valueid: "cmkf45oqp000014a0fx1ke79d",
  },
  {
    id: "7b7cd125-24c3-4ee1-afe7-121fdf0c1b61",
    name: "blue",
    valueid: "cmkf45oqt000614a0y4drut5w",
  },
  {
    id: "967ec910-4713-414d-964b-0a6eb3aa854e",
    name: "Titanium",
    valueid: "cmkf45oqt000714a0xgtccf0e",
  },
  {
    id: "a540bfd8-9878-4660-87d2-aa8f2149633b",
    name: "green",
    valueid: "cmkf45oqt000814a0ztaxuqzh",
  },
  {
    id: "b0232161-f7ed-4d17-9aa6-09571da6f9cf",
    name: "yellow",
    valueid: "cmkf45oqt000914a0dzbkzjk4",
  },
  {
    id: "b299d4fd-6e30-43b8-bc8f-3c13f9bdbb1d",
    valueid: "cmkf45oqt000a14a0clwz2en9",
    name: "White",
  },
];

const products = [
  {
    id: "17318d68-c00e-4e59-bd49-4ba21074153e",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "17ce1094-b670-41cf-96d5-df21cab0f144",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "1bb1d00c-b863-45d2-a7da-8bdeb718012a",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "2a71e717-3395-485b-800a-c7a75272231b",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "34176305-f70b-499c-894a-76ed0308a88e",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "48842927-c57e-4613-8bc1-d4340d571772",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "4fe3e6be-d253-43a0-8e1b-75b7108eb390",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "599e50bd-12df-4e17-9d28-9e6039c13f00",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "7fc4cbaf-5ccd-4188-b370-57337aa47f73",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "cc68c518-6fdf-4525-9d32-239b4efd4fbb",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "ce080648-3845-4c3c-89dd-10a36b5785e8",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "d55155fa-2ad9-4cd1-83b9-25493a7387ce",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "d7608487-3307-467a-a6a7-0caa11235651",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "eb22cbb6-af69-4db8-ab03-2fac5e8c857e",
    colorId: "0d2ae7fc-4eec-4638-8090-811a6c2a9096",
  },
  {
    id: "148c7aa0-b78c-4353-97bc-0694509435c7",
    colorId: "34d3fd5b-7e79-41da-8604-940bdc1cb34b",
  },
  {
    id: "09a9b63b-d196-488e-aa6f-1f149e7a2e25",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "244b7f58-f9db-4b3a-bbeb-35802602b8a6",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "2c508453-a58f-49f1-af9c-212f152801b2",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "3ca5a1cc-47a0-425f-91fe-9e20ee487e71",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "40dceb7d-856e-4711-b728-0441e952485c",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "4f1f54a1-c4e6-4f97-ad62-c00f30dd317a",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "9cabc10b-c4fa-41ce-8974-bfb5367fe793",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "b15dd167-11e5-42a1-a37b-d9a3bce3268c",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "c85746d4-c2ea-427b-9ec3-854a6abf9746",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "d20a2c49-7093-40c7-947b-bc054a2bc755",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "d2e30742-506c-40b3-bee9-b89469f97478",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "d8ee5503-ac3c-402e-8e62-a1ebdfe1147b",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "ebd2cc66-5b24-4ca7-830a-bc0b0b8b8b5d",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "fd4475f8-c0b4-407e-89a2-8728ecf6d404",
    colorId: "54cd8f16-1785-4806-95e5-6f46441f59fe",
  },
  {
    id: "70c0829a-0286-4879-8f64-d1310566d884",
    colorId: "56f7cb57-8f5d-4db5-bf4b-7f5b2b5d8d01",
  },
  {
    id: "a3c428a9-cd52-41c4-b6ec-7c35fb802205",
    colorId: "56f7cb57-8f5d-4db5-bf4b-7f5b2b5d8d01",
  },
  {
    id: "e9f4e9de-426a-422b-a009-cf8530731682",
    colorId: "56f7cb57-8f5d-4db5-bf4b-7f5b2b5d8d01",
  },
  {
    id: "feafb4e3-0743-449d-8403-b755e17b323a",
    colorId: "56f7cb57-8f5d-4db5-bf4b-7f5b2b5d8d01",
  },
  {
    id: "1fa92ea3-794a-48b0-8ea4-2cb2ab99b4c7",
    colorId: "5e2462fb-f8e7-4562-92f1-856158b50cd6",
  },
  {
    id: "3789b3c4-352e-4f9b-99e0-c8c779c58f4e",
    colorId: "5e2462fb-f8e7-4562-92f1-856158b50cd6",
  },
  {
    id: "061adb51-35de-48e2-806d-c4b7a7dfb940",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "06e06ead-90c1-4472-a2ef-c40b8abe04b7",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "091eecdb-e0e1-4f4a-a45b-488614782b7a",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "0ce00e01-3d76-40e7-8589-c5e311990cd1",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "1834ae0d-ac7a-49ca-8b98-91271c66487f",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "1bafc7c0-0f5b-4ce7-9c25-ee1f26bec059",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "1cc77469-9861-431d-ba69-f01717a9911a",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "237b0054-f35d-44f1-b51b-d67c452f12a1",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "2746fb74-16c4-4e9b-a5b6-00e91193cb60",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "2b9a6681-109c-4a44-a5c3-01a92ef4725a",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "315377a5-05cf-44e5-8125-3ee52e1de508",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "37994166-ceef-4959-b84d-118123d57068",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "41530acf-eac3-46cb-aa75-2c231d3052cf",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "472402ba-eb72-4474-8b2a-4817b95d9a7f",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "59f166ca-0731-4684-a83a-210317c4b1dc",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "5e4f43ed-c12c-4d73-957d-2ddd0ab3026b",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "679d7104-08cb-45ca-825c-7d6d57684b11",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "6bbac6b7-81a3-419c-8112-002b929aabac",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "6f8b3097-6cea-4f24-8329-6dca30c48f5d",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "71d14bc2-b84b-429d-9b10-0527c80dab89",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "721c38d8-069f-471a-a8a6-408438f3c670",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "750902c0-fc82-4643-ba44-44e91ea3ccbc",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "8adc4ee3-8150-4e6e-89bd-a40a15c34f81",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "8c0000b9-a658-41e4-bd4b-aa4df247db4d",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "95a7278d-1be3-4d38-9865-bbb18b3c04d1",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "96df7217-7edc-4331-b0e2-687082939844",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "a0294333-1afa-49bd-95f9-4c8da7b18cdd",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "a1e30d4d-867e-4a63-bcfb-8df3ced1bc17",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "a49469f5-5f46-4da4-bf42-d2734f2f382a",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "a68d2d5f-3dfe-4a2f-aca6-7c546cc74124",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "b0287591-dfa4-4bc9-bbd0-a3f858485e49",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "b5b476c3-6be9-4ed0-bc9f-06acbdbe99b9",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "b7d5f148-308e-4977-81e7-43bb68545afd",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "b80a039b-ec53-45ca-9eb4-91c93e853301",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "ba0a3188-fde8-4a0d-9efe-8d1a2945cd48",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "c122f3e0-7329-463f-94fb-6ca67509a0c0",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "ca529742-902d-41d4-91d4-3940be082453",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "cfdace08-a160-4235-a521-c6abbf75d194",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "d06869fa-2abd-4b03-96f5-8cfa29cb6527",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "d1aaac26-84fa-4fff-8254-db5df79e88ca",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "d3b95bac-12f5-475f-8b96-da98e9d18ee3",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "db162e2f-3af2-4ff0-8703-1846b3713c80",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "ddbfadd1-35cd-4c13-9c90-3dafb34ca96a",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "e6dfbfe1-fc7a-4f7f-9aeb-20ffabf8ba83",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "e884392d-b9c8-4856-b0a0-1708bdc19eb8",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "eb213fbb-8557-4c0f-9555-050422e5c3f5",
    colorId: "5ec4c839-52bf-4841-8988-3eff327cf8a6",
  },
  {
    id: "c04cf781-e056-4bc6-8713-8b8771b7e90b",
    colorId: "781009d9-8688-4d55-9544-42874e6cc6ec",
  },
  {
    id: "e35fe1aa-67ba-4563-92c0-8dd307ba1a41",
    colorId: "781009d9-8688-4d55-9544-42874e6cc6ec",
  },
  {
    id: "f59b2a5c-5006-451d-baa8-1d5fea30910c",
    colorId: "781009d9-8688-4d55-9544-42874e6cc6ec",
  },
  {
    id: "63712688-bd6c-4377-a0f4-1c9c2eea9fce",
    colorId: "7b7cd125-24c3-4ee1-afe7-121fdf0c1b61",
  },
  {
    id: "58bf3e4e-ec49-4ea2-ad9f-abc1b034a145",
    colorId: "967ec910-4713-414d-964b-0a6eb3aa854e",
  },
  {
    id: "2833934d-1631-4e82-b336-398c38197301",
    colorId: "a540bfd8-9878-4660-87d2-aa8f2149633b",
  },
  {
    id: "3ee71591-e8d4-4653-8013-211244137520",
    colorId: "a540bfd8-9878-4660-87d2-aa8f2149633b",
  },
  {
    id: "5a02a162-4617-4193-9a9f-8092e51963ab",
    colorId: "a540bfd8-9878-4660-87d2-aa8f2149633b",
  },
  {
    id: "bce4dbfe-39ce-4e12-a357-a6c4d583d301",
    colorId: "a540bfd8-9878-4660-87d2-aa8f2149633b",
  },
  {
    id: "e02a0d23-2283-48e5-a67b-ebf9d48e9344",
    colorId: "a540bfd8-9878-4660-87d2-aa8f2149633b",
  },
  {
    id: "168fa213-2f4c-47c3-9c6a-9713e3b4a717",
    colorId: "b0232161-f7ed-4d17-9aa6-09571da6f9cf",
  },
  {
    id: "746dab76-febd-4042-a770-eab3a5979447",
    colorId: "b0232161-f7ed-4d17-9aa6-09571da6f9cf",
  },
  {
    id: "0e6654cf-6b5f-4afb-8d98-3be738f3d2c0",
    colorId: "b299d4fd-6e30-43b8-bc8f-3c13f9bdbb1d",
  },
  {
    id: "7cd7c8c6-3c6c-427b-bdb2-d5341b2154a3",
    colorId: "b299d4fd-6e30-43b8-bc8f-3c13f9bdbb1d",
  },
  {
    id: "f0485c6a-d311-4fa8-8561-94cb2f2772b1",
    colorId: "b299d4fd-6e30-43b8-bc8f-3c13f9bdbb1d",
  },
];

const migrateColors = async () => {
  const set = new Map<string, string>();
  for (const color of colors) {
    set.set(color.id, color.valueid);
  }

  const filterItems = [];
  for (const product of products) {
    const colorValueId = set.get(product.colorId);
    if (colorValueId) {
      filterItems.push({
        productId: product.id,
        valueId: colorValueId,
      });
    } else {
      console.log(
        `No color valueId found for product ${product.id} with colorId ${product.colorId}`
      );
    }
  }

  console.log("Prepared filter items:", filterItems);
  await prismadb.filterItem.createMany({
    data: filterItems,
  });

  // console(await prismadb.value.findFirst({});)
};

migrateColors();
