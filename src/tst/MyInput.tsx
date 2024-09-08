import { forwardRef } from 'react'


type Props = {
  label: string,
  type: string
}

const MyInput = forwardRef<HTMLDivElement, Props>(
  (props, ref) => {

    const { label, ...otherProps } = props;

    return (
      <div ref={ref}>
        <label>
          {label}
        </label>
        <input {...otherProps} />
      </div>
    )
  }

);


export default MyInput



// import { forwardRef } from 'react'

// type Props = {
//   label: string,
//   type: string
// }

// const MyInput = forwardRef<HTMLInputElement, Props>(
//   (props, ref) => {
//     const { label, ...otherProps } = props;

//     return (
//       <label>
//         {label}
//         <input ref={ref} {...otherProps} />
//       </label>
//     )
//   }
// );

// export default MyInput;