import { getImage } from "./images";
import { shader } from "./shader";

async function main() {
  const sliders = document.querySelectorAll<HTMLInputElement>(
    'input[type="range"]',
  );

  sliders.forEach((slider) => {
    slider.value = localStorage.getItem(slider.name) ?? slider.value;

    slider.addEventListener("input", () => {
      localStorage.setItem(slider.name, slider.value);
      render();
    });
  });

  function getUniforms() {
    return new Float32Array(
      Array.from(sliders).map((s) => parseFloat(s.value)),
    );
  }

  const image = await getImage();
  console.log("image", image);

  const adapter = await navigator.gpu.requestAdapter();
  console.log("adapter", adapter);

  const device = await adapter?.requestDevice({
    requiredFeatures: ["float32-filterable"],
    requiredLimits: {
      maxBufferSize: 1024 * 1024 * 1024 * 2,
    },
  });
  console.log("device", device);

  const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  if (!canvas) {
    throw new Error(`canvas not found`);
  }

  if (!device) {
    throw new Error("could not initialize module");
  }

  const ctx = canvas.getContext("webgpu");
  if (!ctx) {
    throw new Error(`could not initialize canvas for webgpu`);
  }

  const format = navigator.gpu.getPreferredCanvasFormat();

  ctx.configure({
    device,
    format,
  });

  const module = device?.createShaderModule({
    code: shader,
  });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
    },
    fragment: {
      module,
      targets: [{ format }],
    },
  });

  const uniformsBuffer = device.createBuffer({
    size: Float32Array.BYTES_PER_ELEMENT * sliders.length,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformsBuffer,
        },
      },
    ],
  });

  const render = () => {
    device.queue.writeBuffer(uniformsBuffer, 0, getUniforms());
    const encoder = device.createCommandEncoder();

    const canvasTexture = ctx.getCurrentTexture();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasTexture.createView(),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();

    const commandBuffer = encoder.finish();

    device.queue.submit([commandBuffer]);
  };

  render();
}

main();
