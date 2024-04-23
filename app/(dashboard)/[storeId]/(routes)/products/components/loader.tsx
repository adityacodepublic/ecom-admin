"use client";
import React, { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { toast } from "react-hot-toast"
import { Button } from "@/components/ui/button"

import jsonData from './watch.json';

const Loader = () => {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    setLoading(true);
    const start = 6;
  
    try {
      for (let i = start; i < start + 5; i++) {
        console.log("process>"+ i);
        const data = jsonData[i];
        console.log(data);
        await axios.post(`/api/757945cd-8675-46c4-b999-d7a7bcbec812/products`, data);
        router.refresh();
        router.push(`/757945cd-8675-46c4-b999-d7a7bcbec812/products`);
        toast.success('Operation successful.');
      }
    } catch (error) {
      toast.error('Something went wrong.');
      console.log("error for >>>>>")
    } finally {
      setLoading(false);
    }
  };
  

  return (
    <Button onClick={handleClick} disabled={loading}>
      {loading ? 'Loading...' : 'Load Data'}
    </Button>
  );
};

export default Loader;
