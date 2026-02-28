export class MaxHeap<T> {
  private data: T[] = [];

  constructor(private compare: (a: T, b: T) => number) {}

  get size() {
    return this.data.length;
  }

  push(value: T) {
    this.data.push(value);
    this.heapifyUp(this.data.length - 1);
  }

  pop() {
    if (!this.data.length) return null;
    const top = this.data[0];
    const tail = this.data.pop() as T;
    if (this.data.length) {
      this.data[0] = tail;
      this.heapifyDown(0);
    }
    return top;
  }

  trimToSize(maxSize: number) {
    while (this.data.length > maxSize) {
      this.removeWorstLeaf();
    }
  }

  private heapifyUp(index: number) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.data[index], this.data[parent]) <= 0) break;
      [this.data[index], this.data[parent]] = [this.data[parent], this.data[index]];
      index = parent;
    }
  }

  private heapifyDown(index: number) {
    while (true) {
      let largest = index;
      const left = index * 2 + 1;
      const right = index * 2 + 2;
      if (left < this.data.length && this.compare(this.data[left], this.data[largest]) > 0) {
        largest = left;
      }
      if (right < this.data.length && this.compare(this.data[right], this.data[largest]) > 0) {
        largest = right;
      }
      if (largest === index) break;
      [this.data[index], this.data[largest]] = [this.data[largest], this.data[index]];
      index = largest;
    }
  }

  private removeWorstLeaf() {
    if (this.data.length <= 1) {
      this.data.pop();
      return;
    }
    let worstIndex = Math.floor(this.data.length / 2);
    for (let i = worstIndex + 1; i < this.data.length; i++) {
      if (this.compare(this.data[i], this.data[worstIndex]) < 0) {
        worstIndex = i;
      }
    }
    const last = this.data.pop() as T;
    if (worstIndex < this.data.length) {
      this.data[worstIndex] = last;
      this.heapifyUp(worstIndex);
      this.heapifyDown(worstIndex);
    }
  }
}

