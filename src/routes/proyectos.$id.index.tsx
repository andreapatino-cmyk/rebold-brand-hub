import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/proyectos/$id/")({
  component: () => {
    const { id } = Route.useParams();
    const navigate = useNavigate();
    useEffect(() => {
      navigate({ to: "/proyectos/$id/parrilla", params: { id }, replace: true });
    }, [id, navigate]);
    return null;
  },
});
