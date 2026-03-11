import { Alert } from "react-native";
import { useEffect, useState, useRef } from "react";

const useAppwrite = (fn, dependencies = []) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const fnRef = useRef(fn);
  const dependenciesRef = useRef(dependencies);

  fnRef.current = fn;
  dependenciesRef.current = dependencies;

  useEffect(() => {
    let isMounted = true;
    if (isFetchingRef.current) {
      return;
    }

    const fetchData = async () => {
      isFetchingRef.current = true;
      if (isMounted) setLoading(true);
      try {
        const res = await fnRef.current();
        if (!isMounted) return;
        setData(prevData => {
          if (JSON.stringify(prevData) === JSON.stringify(res)) {
            return prevData;
          }
          return res;
        });
      } catch (error) {
        if (isMounted) Alert.alert("Error", error.message);
      } finally {
        if (isMounted) setLoading(false);
        isFetchingRef.current = false;
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refetch = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    try {
      const res = await fnRef.current();
      if (!mountedRef.current) return;
      setData(prevData => {
        if (JSON.stringify(prevData) === JSON.stringify(res)) return prevData;
        return res;
      });
    } catch (error) {
      if (mountedRef.current) Alert.alert("Error", error.message);
    } finally {
      if (mountedRef.current) setLoading(false);
      isFetchingRef.current = false;
    }
  };

  return { data, loading, refetch };
};

export default useAppwrite;
