import { useState, useEffect } from "react";
import { qwenLocalService } from "../../../services/ai/qwenLocal.service";

export const useAIStatus = () => {
  const [isLoaded, setIsLoaded] = useState(qwenLocalService.isLoaded);
  const [isLoading, setIsLoading] = useState(qwenLocalService.isLoading);

  useEffect(() => {
    setIsLoaded(qwenLocalService.isLoaded);
    setIsLoading(qwenLocalService.isLoading);

    const unsubscribe = qwenLocalService.subscribe(() => {
      setIsLoaded(qwenLocalService.isLoaded);
      setIsLoading(qwenLocalService.isLoading);
    });

    return unsubscribe;
  }, []);

  return { isLoaded, isLoading };
};
