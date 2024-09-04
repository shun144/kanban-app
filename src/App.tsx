import "./styles.css";
import { rectSortingStrategy } from "@dnd-kit/sortable";
import { MultipleContainers } from "./Sortable/MultipleContainer";

export default function App() {
  return (
    <div className="App">
      <MultipleContainers
        itemCount={5}
        strategy={rectSortingStrategy}
        vertical={false}
      />
    </div>
  );
}
