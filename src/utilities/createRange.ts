const defaultInitializer = (index: number) => index;

/**
 * 
 * @param length アイテム数
 * @param initializer アイテム名を付与する関数
 * @returns 
 */
export const createRange = <T = number>(
  length: number,
  initializer: (index: number) => any = defaultInitializer
): T[] => {
  return [...new Array(length)].map((_, index) => initializer(index));
}


// const defaultInitializer = (index: number) => index;

// export function createRange<T = number>(
//   length: number,
//   initializer: (index: number) => any = defaultInitializer
// ): T[] {
//   return [...new Array(length)].map((_, index) => initializer(index));
// }

// const test = (name:string, age:number) => console.log(name, age)
// const test = (name: string = 'shun', age: number = 10) => console.log(name, age)

