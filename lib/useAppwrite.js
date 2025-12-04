import { Alert } from "react-native";
import { useEffect, useState, useRef } from "react";

const useAppwrite = (fn, dependencies = []) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const isFetchingRef = useRef(false);
  const fnRef = useRef(fn);
  const dependenciesRef = useRef(dependencies);

  // Update refs when they change
  fnRef.current = fn;
  dependenciesRef.current = dependencies;

  useEffect(() => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      return;
    }

    const fetchData = async () => {
      isFetchingRef.current = true;
      setLoading(true);
      try {
        const res = await fnRef.current();
        // Only update if data actually changed to prevent unnecessary re-renders
        setData(prevData => {
          // Compare arrays/objects by JSON stringify to detect actual changes
          if (JSON.stringify(prevData) === JSON.stringify(res)) {
            return prevData; // Return previous reference if data is the same
          }
          return res;
        });
      } catch (error) {
        Alert.alert("Error", error.message);
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  const refetch = async () => {
    if (isFetchingRef.current) {
      return;
    }
    isFetchingRef.current = true;
    setLoading(true);
    try {
      const res = await fnRef.current();
      // Only update if data actually changed to prevent unnecessary re-renders
      setData(prevData => {
        // Compare arrays/objects by JSON stringify to detect actual changes
        if (JSON.stringify(prevData) === JSON.stringify(res)) {
          return prevData; // Return previous reference if data is the same
        }
        return res;
      });
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  return { data, loading, refetch };
};

export default useAppwrite;
