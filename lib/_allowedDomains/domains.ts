export function getAllowedDomains() {
  return process.env.NODE_ENV === 'production' ? productionDomains : nonProductionDomains;
};
let productionDomains = [
  { domain: 'example.com', storeId: 'store1' },
  { domain: 'anotherdomain.com', storeId: 'store2' },
  { domain: 'http://localhost:3000', storeId: '757945cd-8675-46c4-b999-d7a7bcbec812' },
  { domain: 'https://www.google.com', storeId: '657945cd-8675-46c4-b999-d7a7bcbec812' },
];

let nonProductionDomains = [
  { domain: 'http://localhost:3000', storeId: '757945cd-8675-46c4-b999-d7a7bcbec812' },
  { domain: 'https://www.google.com', storeId: '657945cd-8675-46c4-b999-d7a7bcbec812' },
];

export function getURL(id:string) {
  const stores = getAllowedDomains();
  const store = stores.find(store => store.storeId === id);
  return store ? store.domain : "";
};

export function addStore(domain:string, storeId:string) {
  const newEntry = { domain, storeId };
  const localhostEntry = { domain: 'localhost', storeId };

  productionDomains.push(newEntry);
  nonProductionDomains.push(localhostEntry);
};

export function patchUrl(id:string, newUrl:string) {
  const stores = getAllowedDomains();
  const store = stores.find(store => store.storeId === id);
  if (store) {
    store.domain = newUrl;
    return true;
  };
  return false;
};

export function deleteStore(id:string) {
  const stores = getAllowedDomains();
  const index = stores.findIndex(store => store.storeId === id);
  if (index !== -1) {
    stores.splice(index, 1);
    return true;
  };
  return false;
};





/*  fetch from console

    fetch('http://localhost:3000/api/757945cd-8675-46c4-b999-d7a7bcbec812/billboards', {
    method: 'GET',
    redirect: 'follow'
  })
  .then(response => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .then(data => {
    console.log('Data:', data);
  })
  .catch(error => {
    console.error('Error:', error);
  });



//  middleware prev logic 
  
    // const referer = req.headers.get('referer');
  // if (!referer) {
    //   console.log("No referer header, redirecting to 404");
    //   return NextResponse.rewrite(new URL('/404', req.url));
  // }
  // const refererDomain = new URL(referer).hostname;
  // const isAllowed = allowedDomains.some((entry) => {
    //   return entry.domain === refererDomain && entry.storeId === storeId;
    // });
  // if (!isAllowed) {
  //   console.log("Referer domain not allowed, redirecting to 404");
  //   return NextResponse.rewrite(new URL('/404', req.url));
  // }
  
*/
  