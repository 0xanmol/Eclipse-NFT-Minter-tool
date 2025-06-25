"use client"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { GripVertical, X } from "lucide-react"

interface Attribute {
  trait_type: string
  value: string
}

interface DraggableAttributeItemProps {
  attribute: Attribute
  index: number
  onUpdate: (index: number, field: "trait_type" | "value", value: string) => void
  onRemove: (index: number) => void
  canRemove: boolean
}

function DraggableAttributeItem({ attribute, index, onUpdate, onRemove, canRemove }: DraggableAttributeItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `attribute-${index}`,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex gap-2 items-center p-2 rounded-lg border ${
        isDragging ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      <Input
        placeholder="Trait type"
        value={attribute.trait_type}
        onChange={(e) => onUpdate(index, "trait_type", e.target.value)}
        className="flex-1"
      />

      <Input
        placeholder="Value"
        value={attribute.value}
        onChange={(e) => onUpdate(index, "value", e.target.value)}
        className="flex-1"
      />

      <Button variant="outline" size="sm" onClick={() => onRemove(index)} disabled={!canRemove} className="shrink-0">
        <X className="w-4 h-4" />
      </Button>
    </div>
  )
}

interface DraggableAttributesProps {
  attributes: Attribute[]
  onAttributesChange: (attributes: Attribute[]) => void
  maxAttributes: number
}

export function DraggableAttributes({ attributes, onAttributesChange, maxAttributes }: DraggableAttributesProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = attributes.findIndex((_, i) => `attribute-${i}` === active.id)
      const newIndex = attributes.findIndex((_, i) => `attribute-${i}` === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newAttributes = arrayMove(attributes, oldIndex, newIndex)
        onAttributesChange(newAttributes)
      }
    }
  }

  const updateAttribute = (index: number, field: "trait_type" | "value", value: string) => {
    const newAttributes = attributes.map((attr, i) => (i === index ? { ...attr, [field]: value } : attr))
    onAttributesChange(newAttributes)
  }

  const removeAttribute = (index: number) => {
    if (attributes.length > 1) {
      const newAttributes = attributes.filter((_, i) => i !== index)
      onAttributesChange(newAttributes)
    }
  }

  const addAttribute = () => {
    if (attributes.length < maxAttributes) {
      const newAttributes = [...attributes, { trait_type: "", value: "" }]
      onAttributesChange(newAttributes)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">
            Attributes <span className="text-xs text-gray-500">(max {maxAttributes})</span>
          </h3>
          <p className="text-xs text-gray-500 mt-1">Drag the grip handle to reorder attributes</p>
        </div>
        <Button variant="outline" size="sm" onClick={addAttribute} disabled={attributes.length >= maxAttributes}>
          Add Attribute
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={attributes.map((_, i) => `attribute-${i}`)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {attributes.map((attribute, index) => (
              <DraggableAttributeItem
                key={`attribute-${index}`}
                attribute={attribute}
                index={index}
                onUpdate={updateAttribute}
                onRemove={removeAttribute}
                canRemove={attributes.length > 1}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
