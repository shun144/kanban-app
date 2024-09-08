import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, unstable_batchedUpdates } from 'react-dom';
// import { restrictToParentElement } from '@dnd-kit/modifiers';

import {
  CancelDrop,
  closestCenter,
  pointerWithin,
  rectIntersection,
  CollisionDetection,
  DndContext,
  DragOverlay,
  DropAnimation,
  getFirstCollision,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  Modifiers,
  useDroppable,
  UniqueIdentifier,
  useSensors,
  useSensor,
  MeasuringStrategy,
  KeyboardCoordinateGetter,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  AnimateLayoutChanges,
  SortableContext,
  useSortable,
  arrayMove,
  defaultAnimateLayoutChanges,
  verticalListSortingStrategy,
  SortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { coordinateGetter as multipleContainersCoordinateGetter } from './multipleContainersKeyboardCoordinates';
import { Item, Container, ContainerProps } from '../components';
import { createRange } from '../utilities';
export default {
  title: 'Presets/Sortable/Multiple Containers',
};


/**
 * アニメーションのトリガーや条件を決定するために使用
 * @param args アニメーションを適用するレイアウト変更の条件や、アニメーションの対象の範囲（コンテナや位置など）を指定する
 * @returns 
 */
const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({
    ...args,
    // wasDragging:要素がドラッグされ終わった後の状態に対してアニメーションを適用する 
    wasDragging: true
  });


function DroppableContainer({
  children,
  columns = 1,
  disabled,
  id,
  items,
  style,
  ...props
}: ContainerProps & {

  disabled?: boolean;

  // コンテナを識別するID
  id: UniqueIdentifier;

  // 全コンテナのIDを格納する配列
  items: UniqueIdentifier[];

  style?: React.CSSProperties;
}) {
  const {
    active,       // 現在ドラッグされているアイテムに関する情報を保持（現在どのアイテムがドラッグされているのかを確認したり、そのアイテムに特定のスタイルやクラスを適用したりすることができる）
    attributes,
    isDragging,
    listeners,
    over,         // ドラッグされたアイテムが現在重なっている別のアイテムやその領域のidやデータに関する情報を保持(ユーザーがアイテムをどこにドロップしようとしているのかを特定できる)
    setNodeRef,
    transition,
    transform,
  } = useSortable({
    id,
    data: {
      type: 'container',
      children: items,
    },
    animateLayoutChanges,
  });

  // ドラッグ中のアイテムと重なっているかどうかを判定
  // ドラッグ中のアイテムと重なっているコンテナに対してスタイルを指定するために使用
  // src\components\Container\Container.module.scss
  const isOverContainer = over ? (id === over.id && active?.data.current?.type !== 'container') || items.includes(over.id) : false;

  return (
    <Container
      ref={disabled ? undefined : setNodeRef}
      style={{
        ...style,
        transition,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : undefined,
      }}
      hover={isOverContainer}
      handleProps={{
        ...attributes,
        ...listeners,
      }}
      columns={columns}
      {...props}
    >
      {children}
    </Container>
  );
}

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.5',
      },
      // dragOverlay: {
      //   opacity: '0.1'
      // }
    },
  }),
};


type Items = Record<UniqueIdentifier, UniqueIdentifier[]>;

interface Props {
  adjustScale?: boolean;
  cancelDrop?: CancelDrop;
  columns?: number;
  containerStyle?: React.CSSProperties;
  coordinateGetter?: KeyboardCoordinateGetter;
  getItemStyles?(args: {
    value: UniqueIdentifier;
    index: number;
    overIndex: number;
    isDragging: boolean;
    containerId: UniqueIdentifier;
    isSorting: boolean;
    isDragOverlay: boolean;
  }): React.CSSProperties;
  wrapperStyle?(args: { index: number }): React.CSSProperties;
  itemCount?: number;
  items?: Items;
  handle?: boolean;
  renderItem?: any;
  strategy?: SortingStrategy;
  modifiers?: Modifiers;
  minimal?: boolean;
  trashable?: boolean;
  scrollable?: boolean;
  vertical?: boolean;
}

export const TRASH_ID = 'void';
const PLACEHOLDER_ID = 'placeholder';
const empty: UniqueIdentifier[] = [];

export const MultipleContainers = ({
  adjustScale = false,
  itemCount = 3,
  cancelDrop,
  columns,
  handle = false,
  items: initialItems,
  containerStyle,
  coordinateGetter = multipleContainersCoordinateGetter,
  getItemStyles = () => ({}),
  wrapperStyle = () => ({}),
  minimal = false,
  modifiers,
  renderItem,
  strategy = verticalListSortingStrategy,
  trashable = false,                                        // ゴミ箱エリアの表示フラグ
  vertical = false,                                         // コンテナの配置方向フラグ
  scrollable,                                               // コンテナ内のスクロール有無フラグ（挙動未確認）
}: Props) => {

  const [items, setItems] = useState<Items>(
    () =>
      initialItems ?? {
        A: createRange(itemCount, (index) => `A${index + 1}`),
        B: createRange(itemCount, (index) => `B${index + 1}`),
        C: createRange(itemCount, (index) => `C${index + 1}`),
        D: createRange(itemCount, (index) => `D${index + 1}`),
      }
  );

  const [containers, setContainers] = useState(Object.keys(items) as UniqueIdentifier[]);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);
  const isSortingContainer = activeId ? containers.includes(activeId) : false;

  /**
   * 複数のコンテナ向けに最適化されたカスタム衝突検出戦略
   *
   * - まず、ポインタと交差するドロップ可能なコンテナを探します。
   * - ない場合は、アクティブなドラッグ可能なものと交差するコンテナを探します。
   * - 交差するコンテナがない場合は、最後に一致した交差点を返します。
   */
  const collisionDetectionStrategy: CollisionDetection = useCallback(
    (args) => {
      if (activeId && activeId in items) {
        return closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (container) => container.id in items
          ),
        });
      }

      // まず、交差するドロップ可能オブジェクトを見つけます
      const pointerIntersections = pointerWithin(args);

      // ポインタと重なるコンテナがある場合は、そのコンテナを返す（戻り値はコンテナ配列）
      // ポインタと重なるコンテナが無い場合は、ドラッグ中のアイテムと一番重なり面積が多いコンテナを返す（戻り値はコンテナ配列）
      const intersections = pointerIntersections.length > 0 ? pointerIntersections : rectIntersection(args);

      // コンテナ配列の中で最初に重なったコンテナを返す
      // 第二引数が指定されている場合、第二引数で指定した情報で返す
      let overId = getFirstCollision(intersections, 'id');

      if (overId != null) {
        if (overId === TRASH_ID) {
          // 交差するドロップ可能なオブジェクトがゴミ箱の場合は、早期に返します。
          // アプリでゴミ箱機能を使用していない場合は、これを削除してください。
          return intersections;
        }

        if (overId in items) {

          // オーバーレイされたコンテナに存在するアイテム一覧を取得
          const containerItems = items[overId];

          // If a container is matched and it contains items (columns 'A', 'B', 'C')
          if (containerItems.length > 0) {
            // Return the closest droppable within that container
            overId = closestCenter({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (container) =>
                  container.id !== overId &&
                  containerItems.includes(container.id)
              ),
            })[0]?.id;
          }
        }

        lastOverId.current = overId;

        return [{ id: overId }];
      }

      // ドラッグ可能なアイテムが新しいコンテナに移動すると、レイアウトが変わり、
      // `overId` が `null` になることがあります。キャッシュされた `lastOverId` を、
      // 新しいコンテナに移動されたドラッグ可能なアイテムの ID に手動で設定します。
      // そうしないと、以前の `overId` が返され、アイテムの位置が誤ってシフトする可能性があります。
      if (recentlyMovedToNewContainer.current) {
        lastOverId.current = activeId;
      }

      // If no droppable is matched, return the last match
      return lastOverId.current ? [{ id: lastOverId.current }] : [];
    },
    [activeId, items]
  );

  const [clonedItems, setClonedItems] = useState<Items | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter,
    })
  );


  const findContainer = (id: UniqueIdentifier) => {

    // 引数で渡されるidはアイテムidとコンテナidの可能性がある。
    // アイテムIDとコンテナIDの命名規則は区別する必要がある。（同じ命名規則だと、アイテムIDとコンテナIDが重複してしまう可能性があるため）
    if (id in items) {
      return id;
    }

    return Object.keys(items).find((key) => items[key].includes(id));
  };

  // 配列上のコンテナの位置(index)を取得
  const getIndex = (id: UniqueIdentifier) => {
    const container = findContainer(id);

    if (!container) {
      return -1;
    }

    const index = items[container].indexOf(id);

    return index;
  };

  // ドラッグ操作がキャンセルされた場合に発火するイベントハンドラから呼び出される処理
  // ただ、ドラッグ操作をキャンセルする方法が特定できない
  const onDragCancel = () => {
    console.log('ドラッグ操作をキャンセルしたよ！')
    if (clonedItems) {
      // Reset items to their original state in case items have been
      // Dragged across containers
      setItems(clonedItems);
    }

    setActiveId(null);
    setClonedItems(null);
  };

  useEffect(() => {

    // スムーズなアニメーションやパフォーマンスの最適化
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [items]);


  // ここからがJSX
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetectionStrategy}

      // measuring：ドロップ可能なノードとドラッグ可能なノードを測定する方法を指定
      // 測定：ノードのサイズや位置を特定することと予想。
      // 公式説明ページでは「LayoutMeasuring」プロパティという名称になっているが、
      // 実際は「measuring」にリファクタリンされている
      // 公式説明ページが最新化されていない。
      measuring={{
        droppable: {

          // ドラッグ開始前、ドラッグ開始直後、およびドラッグ終了後にドロップ可能な要素を測定します。
          strategy: MeasuringStrategy.Always,
        },
      }}
      onDragStart={({ active }) => {
        setActiveId(active.id);

        // 2手前の動作時の配列を保持（なぜ、1手前じゃない？） 
        setClonedItems(items);
      }}


      onDragOver={({ active, over }) => {
        const overId = over?.id;

        if (overId == null || overId === TRASH_ID || active.id in items) {
          return;
        }

        /**
         * ドロップされたコンテナ
         */
        const overContainer = findContainer(overId);

        /**
         * ドラッグアイテムが元々あったコンテナ
         */
        const activeContainer = findContainer(active.id);

        if (!overContainer || !activeContainer) {
          return;
        }

        // アイテムをコンテナ間で移動した場合、
        if (activeContainer !== overContainer) {

          setItems((items) => {
            const activeItems = items[activeContainer];
            const overItems = items[overContainer];

            // ドラッグアイテムとドロップコンテナの位置取得
            const overIndex = overItems.indexOf(overId);
            const activeIndex = activeItems.indexOf(active.id);

            let newIndex: number;


            if (overId in items) {
              newIndex = overItems.length + 1;
            } else {
              const isBelowOverItem =
                over &&
                active.rect.current.translated &&
                active.rect.current.translated.top > over.rect.top + over.rect.height;

              const modifier = isBelowOverItem ? 1 : 0;

              newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
            }

            recentlyMovedToNewContainer.current = true;


            // 「[キー]：値」のように、オブジェクト型のキーを[]で囲む表現は、「インデックスシグネチャ」と呼ばれる機能。
            // オブジェクトのキーが事前に決まっていない動的なキー
            return {
              ...items,

              // ドラッグアイテムが元々あったコンテナから、ドラッグアイテムを除外
              [activeContainer]: items[activeContainer].filter(
                (item) => item !== active.id
              ),

              // ドロップコンテナに、ドラッグアイテムを挿入
              [overContainer]: [
                ...items[overContainer].slice(0, newIndex),
                items[activeContainer][activeIndex],
                ...items[overContainer].slice(newIndex, items[overContainer].length),
              ],
            };
          });
        }
      }}



      onDragEnd={({ active, over }) => {

        // コンテナをドラッグした場合
        if (active.id in items && over?.id) {

          setContainers((containers) => {
            const activeIndex = containers.indexOf(active.id);
            const overIndex = containers.indexOf(over.id);

            return arrayMove(containers, activeIndex, overIndex);
          });
        }

        /**
         * ドラッグアイテムが元々あったコンテナ
         */
        const activeContainer = findContainer(active.id);

        if (!activeContainer) {
          setActiveId(null);
          return;
        }

        const overId = over?.id;

        if (overId == null) {
          setActiveId(null);
          return;
        }

        // ドロップ先がゴミ箱
        if (overId === TRASH_ID) {
          setItems((items) => ({
            ...items,
            [activeContainer]: items[activeContainer].filter(
              (id) => id !== activeId
            ),
          }));
          setActiveId(null);
          return;
        }


        // ドロップ先がプレースホルダ
        if (overId === PLACEHOLDER_ID) {
          const newContainerId = getNextContainerId();


          /**
           * Reactが複数の状態更新を一度に処理するためのメソッド
           * - 複数の状態変更があってもレンダリングを1回にまとめることができる
           * - setContainersとsetItemsとsetActiveIdの更新を1回のレンダリングでまとめてくれる
           * - !注意！名前に「unstable」がついている通り、APIは将来的に変更される可能性あり
           */
          unstable_batchedUpdates(() => {
            setContainers((containers) => [...containers, newContainerId]);
            setItems((items) => ({
              ...items,
              [activeContainer]: items[activeContainer].filter(
                (id) => id !== activeId
              ),
              [newContainerId]: [active.id],
            }));
            setActiveId(null);
          });
          return;
        }

        const overContainer = findContainer(overId);

        if (overContainer) {
          const activeIndex = items[activeContainer].indexOf(active.id);
          const overIndex = items[overContainer].indexOf(overId);

          if (activeIndex !== overIndex) {
            setItems((items) => ({
              ...items,

              // arrayMove：新しい並びにした新しい配列を返す
              [overContainer]: arrayMove(items[overContainer], activeIndex, overIndex),
            }));
          }
        }

        setActiveId(null);
      }}
      cancelDrop={cancelDrop}
      onDragCancel={onDragCancel}
      modifiers={modifiers}
    // modifiers={[restrictToParentElement]}
    >
      <div
        style={{
          display: 'inline-grid',
          boxSizing: 'border-box',
          padding: 20,
          gridAutoFlow: vertical ? 'row' : 'column',
        }}
      >
        {/* コンテナのソートエリア */}
        <SortableContext
          items={[...containers, PLACEHOLDER_ID]}
          strategy={vertical ? verticalListSortingStrategy : horizontalListSortingStrategy}
        >
          {containers.map((containerId) => (
            <DroppableContainer
              key={containerId}
              id={containerId}
              label={minimal ? undefined : `Column ${containerId}`}
              columns={columns}
              items={items[containerId]}
              scrollable={scrollable}
              style={containerStyle}
              unstyled={minimal}
              onRemove={() => handleRemove(containerId)}
            >

              {/* タスクのソートエリア */}
              <SortableContext items={items[containerId]} strategy={strategy}>
                {items[containerId].map((value, index) => {
                  return (
                    <SortableItem
                      disabled={isSortingContainer}
                      key={value}
                      id={value}
                      index={index}
                      handle={handle}
                      style={getItemStyles}
                      wrapperStyle={wrapperStyle}
                      renderItem={renderItem}
                      containerId={containerId}
                      getIndex={getIndex}
                    />
                  );
                })}
              </SortableContext>
            </DroppableContainer>
          ))}

          {/* コンテナ追加エリア */}
          {minimal ? undefined : (
            <DroppableContainer
              id={PLACEHOLDER_ID}
              disabled={isSortingContainer}
              items={empty}
              onClick={handleAddColumn}
              placeholder
            >
              + Add column
            </DroppableContainer>
          )}
        </SortableContext>
      </div>

      {/* createPortal：DOM上の別の場所に子要素をレンダー */}
      {createPortal(

        // DragOverlay：アイテムをドラッグしている間のスタイルをカスタマイズ
        <DragOverlay adjustScale={adjustScale} dropAnimation={dropAnimation}>
          {activeId
            ? containers.includes(activeId)
              ? renderContainerDragOverlay(activeId)
              : renderSortableItemDragOverlay(activeId)
            : null}
        </DragOverlay>,
        document.body
      )}

      {trashable && activeId && !containers.includes(activeId) ? (
        <Trash id={TRASH_ID} />
      ) : null}
    </DndContext>
  );

  // ドラッグ中のアイテムのデザインを指定
  function renderSortableItemDragOverlay(id: UniqueIdentifier) {

    // console.log(renderItem)

    return (
      <Item
        value={id}
        handle={handle}
        style={getItemStyles({
          containerId: findContainer(id) as UniqueIdentifier,
          overIndex: -1,
          index: getIndex(id),
          value: id,
          isSorting: true,
          isDragging: true,
          isDragOverlay: true,
        })}
        color={getColor(id)}
        wrapperStyle={wrapperStyle({ index: 0 })}
        renderItem={renderItem}
        dragOverlay
      />
    );
  }

  // ドラッグ中のコンテナのデザインを指定
  function renderContainerDragOverlay(containerId: UniqueIdentifier) {
    return (
      <Container
        label={`Column ${containerId}`}
        columns={columns}
        style={{
          height: '100%',
          // backgroundColor: 'red',
        }}
        shadow
        unstyled={false}
      >
        {items[containerId].map((item, index) => (
          <Item
            key={item}
            value={item}
            handle={handle}
            style={getItemStyles({
              containerId,
              overIndex: -1,
              index: getIndex(item),
              value: item,
              isDragging: false,
              isSorting: false,
              isDragOverlay: false,
            })}
            color={getColor(item)}
            wrapperStyle={wrapperStyle({ index })}
            renderItem={renderItem}
          />
        ))}
      </Container>
    );
  }

  // コンテナの削除
  function handleRemove(containerID: UniqueIdentifier) {
    setContainers((containers) =>
      containers.filter((id) => id !== containerID)
    );
  }

  // コンテナの追加
  function handleAddColumn() {
    const newContainerId = getNextContainerId();

    unstable_batchedUpdates(() => {
      setContainers((containers) => [...containers, newContainerId]);
      setItems((items) => ({
        ...items,
        [newContainerId]: [],
      }));
    });
  }

  function getNextContainerId() {
    const containerIds = Object.keys(items);
    const lastContainerId = containerIds[containerIds.length - 1];

    // 次のアルファベットを返す
    return String.fromCharCode(lastContainerId.charCodeAt(0) + 1);
  }
}

function getColor(id: UniqueIdentifier) {
  switch (String(id)[0]) {
    case 'A':
      return '#7193f1';
    case 'B':
      return '#ffda6c';
    case 'C':
      return '#00bcd4';
    case 'D':
      return '#ef769f';
  }

  return undefined;
}

function Trash({ id }: { id: UniqueIdentifier }) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'fixed',
        left: '50%',
        marginLeft: -150,
        bottom: 20,
        width: 300,
        height: 60,
        borderRadius: 5,
        border: '1px solid',
        borderColor: isOver ? 'red' : '#DDD',
      }}
    >
      Drop here to delete
    </div>
  );
}

interface SortableItemProps {
  containerId: UniqueIdentifier;
  id: UniqueIdentifier;
  index: number;
  handle: boolean;
  disabled?: boolean;
  style(args: any): React.CSSProperties;
  getIndex(id: UniqueIdentifier): number;
  renderItem(): React.ReactElement;
  wrapperStyle({ index }: { index: number }): React.CSSProperties;
}

// タスクアイテム
function SortableItem({
  disabled,
  id,
  index,
  handle,
  renderItem,
  style,
  containerId,
  getIndex,
  wrapperStyle,
}: SortableItemProps) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    isDragging,
    isSorting,
    over,
    overIndex,
    transform,
    transition,
  } = useSortable({
    id,
  });
  const mounted = useMountStatus();
  const mountedWhileDragging = isDragging && !mounted;

  return (
    <Item
      ref={disabled ? undefined : setNodeRef}
      value={id}
      dragging={isDragging}
      sorting={isSorting}
      handle={handle}
      handleProps={handle ? { ref: setActivatorNodeRef } : undefined}
      index={index}
      wrapperStyle={wrapperStyle({ index })}
      style={style({
        index,
        value: id,
        isDragging,
        isSorting,
        overIndex: over ? getIndex(over.id) : overIndex,
        containerId,
      })}
      color={getColor(id)}
      transition={transition}
      transform={transform}
      fadeIn={mountedWhileDragging}
      listeners={listeners}
      renderItem={renderItem}
    />
  );
}

function useMountStatus() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setIsMounted(true), 500);

    return () => clearTimeout(timeout);
  }, []);

  return isMounted;
}
