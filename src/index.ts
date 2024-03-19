import { getImage } from "./images";

async function main() {
  const image = await getImage();

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
    code: `

struct Out {
  @builtin(position) position: vec4f,
  @location(0) pos: vec4f
}

@vertex
fn vertex_shader (@builtin(vertex_index) index: u32) -> Out {

   let points = array(
     vec4f(1,-1,0,1),
     vec4f(-1,1,0,1),
     vec4f(-1,-1,0,1),

     vec4f(1,-1,0,1),
     vec4f(-1,1,0,1),
     vec4f(1,1,0,1)
   );

   return Out(points[index], points[index]);
}


struct Uniforms {
  slice: f32,
  level: f32,
  width: f32
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var volumeTexture: texture_3d<f32>;
@group(0) @binding(2) var volumeSampler: sampler;

@fragment
fn fragment_shader (@location(0) p: vec4f) -> @location(0) vec4f {
 let pos = (p.xyz + 1.) / 2. + vec3f(0,0,uniforms.slice);
 let hu = textureSample(volumeTexture, volumeSampler, pos.xyz).r;
   let gray = clamp((hu - uniforms.level) / uniforms.width, 0, 1);
   return vec4f(gray, gray, gray, 1);
}

`,
  });

  const volumeSampler = device.createSampler({
    minFilter: "linear",
    magFilter: "linear",
  });

  const volumeTexture = device.createTexture({
    format: "r32float",
    dimension: "3d",
    size: [image.columns, image.rows, image.slices],
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
  });

  device.queue.writeTexture(
    { texture: volumeTexture },
    image.volume,
    {
      bytesPerRow: image.columns * Float32Array.BYTES_PER_ELEMENT,
      rowsPerImage: image.rows,
    },
    [image.columns, image.rows, image.slices],
  );

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
    size: Float32Array.BYTES_PER_ELEMENT * 3,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });

  let slice = 10;
  let width = 400;
  let level = -120;

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformsBuffer,
        },
      },
      {
        binding: 1,
        resource: volumeTexture.createView(),
      },
      {
        binding: 2,
        resource: volumeSampler,
      },
    ],
  });

  const render = () => {
    device.queue.writeBuffer(
      uniformsBuffer,
      0,
      new Float32Array([slice, level, width]),
    );
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
    pass.draw(6);
    pass.end();

    const commandBuffer = encoder.finish();

    device.queue.submit([commandBuffer]);
  };

  const slider = document.querySelector<HTMLInputElement>("#slider")!;
  slider.addEventListener("input", () => {
    slice = parseFloat(slider.value);
    render();
  });

  const sliderLevel =
    document.querySelector<HTMLInputElement>("#slider-level")!;
  sliderLevel.addEventListener("input", () => {
    level = parseFloat(sliderLevel.value);
    render();
  });

  const sliderWidth =
    document.querySelector<HTMLInputElement>("#slider-width")!;
  sliderWidth.addEventListener("input", () => {
    width = parseFloat(sliderWidth.value);
    render();
  });

  render();
}

main();
