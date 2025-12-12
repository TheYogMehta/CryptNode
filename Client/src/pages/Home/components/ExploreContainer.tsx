import React from "react";
import { useEffect, useState } from "react";
import { queryDB, executeDB } from "../../../services/sqliteService";
import "./ExploreContainer.css";

// For Testing

interface ContainerProps {}

const ExploreContainer: React.FC<ContainerProps> = () => {
  const [rows, setRows] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const data = await queryDB("SELECT * FROM TEST;");
      setRows(data);
    };

    fetchData();
  }, []);

  const addRow = async () => {
    await executeDB(`INSERT INTO TEST(text) VALUES('new row');`);
    const data = await queryDB("SELECT * FROM TEST;");
    setRows(data);
  };

  return (
    <div id="container">
      <strong>Save Message In DB?</strong>
      <div>
        <button onClick={addRow}>Add Row</button>
        <ul>
          {rows.map((r) => (
            <li key={r.id}>{r.text}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ExploreContainer;
