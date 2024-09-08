import { useRef } from 'react';
import MyInput from './MyInput';

const Tst = () => {
  const ref = useRef<HTMLDivElement>(null);

  const handleClick = () => {
    // ref.current?.focus();
    console.log(ref.current?.focus)
  };

  return (
    <form>

      <MyInput label="test" type='text' ref={ref} />
      {/* <MyInput label="test" type='text' ref={refKo} /> */}
      <button type='button' onClick={handleClick}>Edit</button>
    </form>
  )
}

export default Tst