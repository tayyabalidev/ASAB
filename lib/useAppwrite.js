import { Alert } from "react-native";
import { useEffect, useState, useRef } from "react";

function feedListSignature(list) {
  if (!Array.isArray(list)) return "0";
  if (list.length === 0) return "0";
  return list
    .map((x) => `${x.$id ?? ""}:${x.$updatedAt ?? x.$createdAt ?? ""}`)
    .join("|");
}

const useAppwrite = (fn, dependencies = []) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetchGenerationRef = useRef(0);
  const fnRef = useRef(fn);

  fnRef.current = fn;

  useEffect(() => {
    const generation = ++fetchGenerationRef.current;
    let isMounted = true;

    const fetchData = async () => {
      if (isMounted) setLoading(true);
      try {
        const res = await fnRef.current();
        if (!isMounted || generation !== fetchGenerationRef.current) return;
        setData((prevData) => {
          if (Array.isArray(prevData) && Array.isArray(res)) {
            if (feedListSignature(prevData) === feedListSignature(res)) {
              return prevData;
            }
            return res;
          }
          if (JSON.stringify(prevData) === JSON.stringify(res)) {
            return prevData;
          }
          return res;
        });
      } catch (error) {
        if (isMounted && generation === fetchGenerationRef.current) {
          Alert.alert("Error", error.message);
        }
      } finally {
        if (isMounted && generation === fetchGenerationRef.current) {
          setLoading(false);
        }
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
    const generation = ++fetchGenerationRef.current;
    if (mountedRef.current) setLoading(true);
    try {
      const res = await fnRef.current();
      if (!mountedRef.current || generation !== fetchGenerationRef.current) return;
      setData((prevData) => {
        if (Array.isArray(prevData) && Array.isArray(res)) {
          if (feedListSignature(prevData) === feedListSignature(res)) {
            return prevData;
          }
          return res;
        }
        if (JSON.stringify(prevData) === JSON.stringify(res)) {
          return prevData;
        }
        return res;
      });
    } catch (error) {
      if (mountedRef.current && generation === fetchGenerationRef.current) {
        Alert.alert("Error", error.message);
      }
    } finally {
      if (mountedRef.current && generation === fetchGenerationRef.current) {
        setLoading(false);
      }
    }
  };

  return { data, loading, refetch };
};

export default useAppwrite;
